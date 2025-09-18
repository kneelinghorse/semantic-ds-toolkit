import { CIDPack, CIDRegistry } from './cid-registry';

export interface PackDependency {
  name: string;
  version: string;
  constraint: string;
}

export interface PackResolutionResult {
  success: boolean;
  loadOrder: string[];
  errors: string[];
  warnings: string[];
}

export interface PackMetadata {
  pack: string;
  version: string;
  depends_on?: string[];
  loaded: boolean;
  loadTime?: number;
}

export class PackManager {
  private registry: CIDRegistry;
  private packMetadata: Map<string, PackMetadata> = new Map();
  private dependencyGraph: Map<string, Set<string>> = new Map();
  private reverseDependencyGraph: Map<string, Set<string>> = new Map();

  constructor(registry: CIDRegistry) {
    this.registry = registry;
  }

  async loadPack(pack: CIDPack): Promise<PackResolutionResult> {
    const startTime = Date.now();

    try {
      const resolutionResult = this.resolveDependencies(pack);

      if (!resolutionResult.success) {
        return resolutionResult;
      }

      for (const packName of resolutionResult.loadOrder) {
        if (packName === pack.pack) {
          this.registry.registerPack(pack);
          this.recordPackLoad(pack, Date.now() - startTime);
        } else {
          if (!this.isPackLoaded(packName)) {
            resolutionResult.errors.push(`Dependency pack '${packName}' not available`);
            return { ...resolutionResult, success: false };
          }
        }
      }

      return resolutionResult;
    } catch (error) {
      return {
        success: false,
        loadOrder: [],
        errors: [`Failed to load pack '${pack.pack}': ${error}`],
        warnings: []
      };
    }
  }

  async loadMultiplePacks(packs: CIDPack[]): Promise<PackResolutionResult> {
    const allDependencies = new Map<string, CIDPack>();
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const pack of packs) {
      allDependencies.set(pack.pack, pack);
    }

    const globalResolution = this.resolveMultiplePackDependencies(Array.from(allDependencies.values()));

    if (!globalResolution.success) {
      return globalResolution;
    }

    const startTime = Date.now();
    for (const packName of globalResolution.loadOrder) {
      const pack = allDependencies.get(packName);
      if (pack) {
        this.registry.registerPack(pack);
        this.recordPackLoad(pack, Date.now() - startTime);
      } else if (!this.isPackLoaded(packName)) {
        errors.push(`Required dependency '${packName}' not found`);
      }
    }

    return {
      success: errors.length === 0,
      loadOrder: globalResolution.loadOrder,
      errors: [...globalResolution.errors, ...errors],
      warnings: [...globalResolution.warnings, ...warnings]
    };
  }

  private resolveDependencies(pack: CIDPack): PackResolutionResult {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const loadOrder: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    const visit = (packName: string, packData?: CIDPack): boolean => {
      if (visiting.has(packName)) {
        errors.push(`Circular dependency detected involving pack '${packName}'`);
        return false;
      }

      if (visited.has(packName)) {
        return true;
      }

      visiting.add(packName);

      const currentPack = packData || this.getPackByName(packName);
      if (!currentPack) {
        if (!this.isPackLoaded(packName)) {
          errors.push(`Dependency pack '${packName}' not found`);
          return false;
        }
        visited.add(packName);
        visiting.delete(packName);
        return true;
      }

      const dependencies = this.parseDependencies(currentPack.depends_on || []);

      for (const dep of dependencies) {
        if (!this.validateVersionConstraint(dep)) {
          errors.push(`Version constraint validation failed for '${dep.name}@${dep.constraint}'`);
          return false;
        }

        if (!visit(dep.name)) {
          return false;
        }
      }

      visited.add(packName);
      visiting.delete(packName);

      if (!this.isPackLoaded(packName)) {
        loadOrder.push(packName);
      }

      return true;
    };

    const success = visit(pack.pack, pack);

    return {
      success,
      loadOrder,
      errors,
      warnings
    };
  }

  private resolveMultiplePackDependencies(packs: CIDPack[]): PackResolutionResult {
    const allPacks = new Map<string, CIDPack>();
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const loadOrder: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const pack of packs) {
      allPacks.set(pack.pack, pack);
    }

    const visit = (packName: string): boolean => {
      if (visiting.has(packName)) {
        errors.push(`Circular dependency detected involving pack '${packName}'`);
        return false;
      }

      if (visited.has(packName)) {
        return true;
      }

      visiting.add(packName);

      const pack = allPacks.get(packName);
      if (!pack) {
        if (!this.isPackLoaded(packName)) {
          errors.push(`Required pack '${packName}' not found in provided packs or registry`);
          return false;
        }
        visited.add(packName);
        visiting.delete(packName);
        return true;
      }

      const dependencies = this.parseDependencies(pack.depends_on || []);

      for (const dep of dependencies) {
        if (!this.validateVersionConstraint(dep)) {
          errors.push(`Version constraint validation failed for '${dep.name}@${dep.constraint}'`);
          return false;
        }

        if (!visit(dep.name)) {
          return false;
        }
      }

      visited.add(packName);
      visiting.delete(packName);

      if (!this.isPackLoaded(packName)) {
        loadOrder.push(packName);
      }

      return true;
    };

    let success = true;
    for (const pack of packs) {
      if (!visit(pack.pack)) {
        success = false;
      }
    }

    return {
      success,
      loadOrder,
      errors,
      warnings
    };
  }

  private parseDependencies(dependsOn: string[]): PackDependency[] {
    return dependsOn.map(dep => {
      const match = dep.match(/^([^@>=<]+)(@|>=|<=|>|<|=)?(.+)?$/);
      if (!match) {
        return { name: dep, version: '*', constraint: '*' };
      }

      const [, name, operator = '=', version = '*'] = match;
      return {
        name: name.trim(),
        version: version.trim(),
        constraint: `${operator}${version.trim()}`
      };
    });
  }

  private validateVersionConstraint(dependency: PackDependency): boolean {
    const loadedPack = this.packMetadata.get(dependency.name);
    if (!loadedPack) return true; // Will be validated during loading

    return this.satisfiesConstraint(loadedPack.version, dependency.constraint);
  }

  private satisfiesConstraint(version: string, constraint: string): boolean {
    if (constraint === '*') return true;

    const constraintMatch = constraint.match(/^(>=|<=|>|<|=)?(.+)$/);
    if (!constraintMatch) return false;

    const [, operator = '=', targetVersion] = constraintMatch;
    const comparison = this.compareVersions(version, targetVersion);

    switch (operator) {
      case '>=': return comparison >= 0;
      case '<=': return comparison <= 0;
      case '>': return comparison > 0;
      case '<': return comparison < 0;
      case '=': return comparison === 0;
      default: return false;
    }
  }

  private compareVersions(v1: string, v2: string): number {
    const normalize = (v: string) => v.split('.').map(x => parseInt(x, 10) || 0);
    const parts1 = normalize(v1);
    const parts2 = normalize(v2);
    const maxLength = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < maxLength; i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;
      if (part1 !== part2) {
        return part1 - part2;
      }
    }

    return 0;
  }

  private getPackByName(packName: string): CIDPack | null {
    return this.registry.getPack(packName);
  }

  private isPackLoaded(packName: string): boolean {
    return this.packMetadata.has(packName) && this.packMetadata.get(packName)!.loaded;
  }

  private recordPackLoad(pack: CIDPack, loadTime: number): void {
    this.packMetadata.set(pack.pack, {
      pack: pack.pack,
      version: pack.version,
      depends_on: pack.depends_on,
      loaded: true,
      loadTime
    });

    this.updateDependencyGraph(pack);
  }

  private updateDependencyGraph(pack: CIDPack): void {
    const dependencies = this.parseDependencies(pack.depends_on || []);
    const depNames = dependencies.map(dep => dep.name);

    this.dependencyGraph.set(pack.pack, new Set(depNames));

    for (const depName of depNames) {
      if (!this.reverseDependencyGraph.has(depName)) {
        this.reverseDependencyGraph.set(depName, new Set());
      }
      this.reverseDependencyGraph.get(depName)!.add(pack.pack);
    }
  }

  getLoadedPacks(): PackMetadata[] {
    return Array.from(this.packMetadata.values()).filter(meta => meta.loaded);
  }

  getDependents(packName: string): string[] {
    return Array.from(this.reverseDependencyGraph.get(packName) || []);
  }

  getDependencies(packName: string): string[] {
    return Array.from(this.dependencyGraph.get(packName) || []);
  }

  unloadPack(packName: string): { success: boolean; warnings: string[] } {
    const dependents = this.getDependents(packName);
    const warnings: string[] = [];

    if (dependents.length > 0) {
      warnings.push(`Pack '${packName}' has dependents: ${dependents.join(', ')}`);
      return { success: false, warnings };
    }

    this.packMetadata.delete(packName);
    this.dependencyGraph.delete(packName);
    this.reverseDependencyGraph.delete(packName);

    return { success: true, warnings };
  }

  getPackInfo(packName: string): PackMetadata | null {
    return this.packMetadata.get(packName) || null;
  }

  validatePackCompatibility(packs: CIDPack[]): { compatible: boolean; conflicts: string[] } {
    const conflicts: string[] = [];
    const versionMap = new Map<string, string[]>();

    for (const pack of packs) {
      if (!versionMap.has(pack.pack)) {
        versionMap.set(pack.pack, []);
      }
      versionMap.get(pack.pack)!.push(pack.version);
    }

    for (const [packName, versions] of versionMap) {
      if (versions.length > 1) {
        conflicts.push(`Multiple versions of pack '${packName}': ${versions.join(', ')}`);
      }
    }

    for (const pack of packs) {
      const deps = this.parseDependencies(pack.depends_on || []);
      for (const dep of deps) {
        const availableVersions = versionMap.get(dep.name);
        if (availableVersions) {
          const compatible = availableVersions.some(v =>
            this.satisfiesConstraint(v, dep.constraint)
          );
          if (!compatible) {
            conflicts.push(
              `Pack '${pack.pack}' requires '${dep.name}@${dep.constraint}' ` +
              `but available versions are: ${availableVersions.join(', ')}`
            );
          }
        }
      }
    }

    return {
      compatible: conflicts.length === 0,
      conflicts
    };
  }
}