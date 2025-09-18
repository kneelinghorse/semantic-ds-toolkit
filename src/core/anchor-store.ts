import * as fs from 'fs/promises';
import * as path from 'path';
import { parse, stringify } from 'yaml';
import { StableColumnAnchor, AnchorStore } from '../types/anchor.types';

export class AnchorStoreManager {
  private storePath: string;
  private cache: Map<string, StableColumnAnchor> = new Map();
  private datasetIndex: Map<string, string[]> = new Map();
  private dirty: boolean = false;

  constructor(storePath: string = './semantics/anchors') {
    this.storePath = storePath;
  }

  async ensureStoreDirectory(): Promise<void> {
    try {
      await fs.access(this.storePath);
    } catch {
      await fs.mkdir(this.storePath, { recursive: true });
    }
  }

  private getAnchorFilePath(anchorId: string): string {
    const prefix = anchorId.substring(4, 6); // Extract first 2 chars after 'sca_'
    return path.join(this.storePath, `${prefix}.yml`);
  }

  private getDatasetIndexPath(): string {
    return path.join(this.storePath, 'index.yml');
  }

  private anchorToYaml(anchor: StableColumnAnchor): string {
    return stringify({ anchor });
  }

  private yamlToAnchor(yamlContent: string): StableColumnAnchor | null {
    try {
      const obj = parse(yamlContent);
      if (!obj || typeof obj !== 'object' || !('anchor' in obj)) return null;
      const a = (obj as any).anchor as Partial<StableColumnAnchor>;
      if (
        a &&
        a.dataset &&
        a.column_name &&
        a.anchor_id &&
        a.fingerprint &&
        a.first_seen &&
        a.last_seen
      ) {
        return a as StableColumnAnchor;
      }
      return null;
    } catch (error) {
      console.error('Error parsing YAML anchor:', error);
      return null;
    }
  }

  async loadAnchors(): Promise<void> {
    await this.ensureStoreDirectory();

    try {
      const files = await fs.readdir(this.storePath);
      const yamlFiles = files.filter(file => file.endsWith('.yml') && file !== 'index.yml');

      this.cache.clear();
      this.datasetIndex.clear();

      for (const file of yamlFiles) {
        const filePath = path.join(this.storePath, file);
        const content = await fs.readFile(filePath, 'utf-8');

        const sections = content.split(/\n---\n/g);

        for (const section of sections) {
          if (section.trim()) {
            const anchor = this.yamlToAnchor(section);
            if (anchor) {
              this.cache.set(anchor.anchor_id, anchor);

              if (!this.datasetIndex.has(anchor.dataset)) {
                this.datasetIndex.set(anchor.dataset, []);
              }
              this.datasetIndex.get(anchor.dataset)!.push(anchor.anchor_id);
            }
          }
        }
      }

      await this.loadDatasetIndex();
    } catch (error) {
      console.error('Error loading anchors:', error);
    }
  }

  private async loadDatasetIndex(): Promise<void> {
    try {
      const indexPath = this.getDatasetIndexPath();
      const content = await fs.readFile(indexPath, 'utf-8');
      const obj = parse(content) as any;
      if (obj && Array.isArray(obj.datasets)) {
        for (const entry of obj.datasets) {
          const ds = entry.dataset as string;
          const ids = Array.isArray(entry.anchors) ? (entry.anchors as string[]) : [];
          if (!this.datasetIndex.has(ds)) this.datasetIndex.set(ds, []);
          const existing = this.datasetIndex.get(ds)!;
          for (const id of ids) {
            if (!existing.includes(id)) existing.push(id);
          }
        }
      }
    } catch (error) {
      // Index file doesn't exist yet, that's okay
    }
  }

  async saveAnchor(anchor: StableColumnAnchor): Promise<void> {
    await this.ensureStoreDirectory();

    const filePath = this.getAnchorFilePath(anchor.anchor_id);
    const yamlContent = this.anchorToYaml(anchor);

    let existingContent = '';
    try {
      existingContent = await fs.readFile(filePath, 'utf-8');
    } catch {
      // File doesn't exist, that's fine
    }

    const sections = existingContent ? existingContent.split('\n---\n') : [];
    let updated = false;

    for (let i = 0; i < sections.length; i++) {
      const existingAnchor = this.yamlToAnchor(sections[i]);
      if (existingAnchor && existingAnchor.anchor_id === anchor.anchor_id) {
        sections[i] = yamlContent;
        updated = true;
        break;
      }
    }

    if (!updated) {
      sections.push(yamlContent);
    }

    const finalContent = sections.filter(s => s.trim()).join('\n---\n');
    await fs.writeFile(filePath, finalContent, 'utf-8');

    this.cache.set(anchor.anchor_id, anchor);

    if (!this.datasetIndex.has(anchor.dataset)) {
      this.datasetIndex.set(anchor.dataset, []);
    }
    const datasetAnchors = this.datasetIndex.get(anchor.dataset)!;
    if (!datasetAnchors.includes(anchor.anchor_id)) {
      datasetAnchors.push(anchor.anchor_id);
      this.dirty = true;
    }

    if (this.dirty) {
      await this.saveDatasetIndex();
    }
  }

  private async saveDatasetIndex(): Promise<void> {
    const indexPath = this.getDatasetIndexPath();
    const datasets = Array.from(this.datasetIndex.entries()).map(([dataset, anchors]) => ({ dataset, anchors }));
    const yaml = stringify({ datasets });
    await fs.writeFile(indexPath, yaml, 'utf-8');
    this.dirty = false;
  }

  async getAnchor(anchorId: string): Promise<StableColumnAnchor | null> {
    if (this.cache.size === 0) {
      await this.loadAnchors();
    }

    return this.cache.get(anchorId) || null;
  }

  async getAnchorsForDataset(dataset: string): Promise<StableColumnAnchor[]> {
    if (this.cache.size === 0) {
      await this.loadAnchors();
    }

    const anchorIds = this.datasetIndex.get(dataset) || [];
    const anchors: StableColumnAnchor[] = [];

    for (const anchorId of anchorIds) {
      const anchor = this.cache.get(anchorId);
      if (anchor) {
        anchors.push(anchor);
      }
    }

    return anchors;
  }

  async getAllAnchors(): Promise<StableColumnAnchor[]> {
    if (this.cache.size === 0) {
      await this.loadAnchors();
    }

    return Array.from(this.cache.values());
  }

  async deleteAnchor(anchorId: string): Promise<boolean> {
    const anchor = await this.getAnchor(anchorId);
    if (!anchor) return false;

    this.cache.delete(anchorId);

    const datasetAnchors = this.datasetIndex.get(anchor.dataset);
    if (datasetAnchors) {
      const index = datasetAnchors.indexOf(anchorId);
      if (index >= 0) {
        datasetAnchors.splice(index, 1);
        this.dirty = true;
      }
    }

    const filePath = this.getAnchorFilePath(anchorId);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const sections = content.split('\n---\n');
      const filteredSections = sections.filter(section => {
        const parsedAnchor = this.yamlToAnchor(section);
        return !parsedAnchor || parsedAnchor.anchor_id !== anchorId;
      });

      if (filteredSections.length === 0) {
        await fs.unlink(filePath);
      } else {
        const newContent = filteredSections.join('\n---\n');
        await fs.writeFile(filePath, newContent, 'utf-8');
      }

      if (this.dirty) {
        await this.saveDatasetIndex();
      }

      return true;
    } catch (error) {
      console.error('Error deleting anchor:', error);
      return false;
    }
  }

  async getStats(): Promise<{
    total_anchors: number;
    datasets: number;
    anchors_per_dataset: Record<string, number>;
    last_updated: string;
  }> {
    if (this.cache.size === 0) {
      await this.loadAnchors();
    }

    const anchorsPerDataset: Record<string, number> = {};
    for (const [dataset, anchorIds] of this.datasetIndex.entries()) {
      anchorsPerDataset[dataset] = anchorIds.length;
    }

    const allAnchors = Array.from(this.cache.values());
    const lastUpdated = allAnchors.length > 0
      ? Math.max(...allAnchors.map(a => new Date(a.last_seen).getTime()))
      : Date.now();

    return {
      total_anchors: this.cache.size,
      datasets: this.datasetIndex.size,
      anchors_per_dataset: anchorsPerDataset,
      last_updated: new Date(lastUpdated).toISOString()
    };
  }

  async bulkSaveAnchors(anchors: StableColumnAnchor[]): Promise<void> {
    for (const anchor of anchors) {
      await this.saveAnchor(anchor);
    }
  }

  async findAnchorsByPattern(pattern: RegExp): Promise<StableColumnAnchor[]> {
    if (this.cache.size === 0) {
      await this.loadAnchors();
    }

    return Array.from(this.cache.values()).filter(anchor =>
      pattern.test(anchor.column_name) ||
      pattern.test(anchor.fingerprint) ||
      (anchor.mapped_cid && pattern.test(anchor.mapped_cid))
    );
  }
}
