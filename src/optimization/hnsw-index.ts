import { globalProfiler } from './performance-profiler';

interface HNSWNode {
  id: string;
  vector: Float32Array;
  level: number;
  connections: Map<number, Set<string>>; // level -> set of connected node IDs
  metadata?: Record<string, any>;
}

interface SearchResult {
  id: string;
  distance: number;
  metadata?: Record<string, any>;
}

interface HNSWConfig {
  maxConnections: number;     // M parameter - max connections per layer
  levelMultiplier: number;    // mL parameter for level generation
  efConstruction: number;     // size of dynamic candidate list during construction
  efSearch: number;           // size of dynamic candidate list during search
  maxLevels: number;          // maximum number of levels
  distanceFunction: (a: Float32Array, b: Float32Array) => number;
}

interface HNSWStats {
  nodeCount: number;
  levelDistribution: number[];
  averageConnections: number;
  searchPerformance: {
    averageDistance: number;
    averageComparisons: number;
  };
}

export class HierarchicalNavigableSmallWorld {
  private config: HNSWConfig;
  private nodes = new Map<string, HNSWNode>();
  private entryPoint: string | null = null;
  private levelCounts: number[] = [];

  constructor(config: Partial<HNSWConfig> = {}) {
    this.config = {
      maxConnections: 16,
      levelMultiplier: 1 / Math.log(2.0),
      efConstruction: 200,
      efSearch: 50,
      maxLevels: 16,
      distanceFunction: this.euclideanDistance,
      ...config
    };
  }

  private euclideanDistance(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  private cosineDistance(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 1; // Maximum distance for zero vectors
    }

    return 1 - (dotProduct / (normA * normB));
  }

  private generateLevel(): number {
    // Generate random level using exponential decay
    let level = 0;
    while (Math.random() < 0.5 && level < this.config.maxLevels - 1) {
      level++;
    }
    return level;
  }

  addNode(id: string, vector: Float32Array, metadata?: Record<string, any>): void {
    if (this.nodes.has(id)) {
      throw new Error(`Node ${id} already exists`);
    }

    const level = this.generateLevel();
    const node: HNSWNode = {
      id,
      vector: new Float32Array(vector), // Copy to prevent external modifications
      level,
      connections: new Map(),
      metadata
    };

    // Initialize connection sets for each level
    for (let l = 0; l <= level; l++) {
      node.connections.set(l, new Set());
    }

    this.nodes.set(id, node);
    this.updateLevelCounts(level);

    if (this.entryPoint === null || level > this.nodes.get(this.entryPoint)!.level) {
      this.entryPoint = id;
    }

    // Connect the node to the graph
    this.connectNode(node);
  }

  private updateLevelCounts(level: number): void {
    while (this.levelCounts.length <= level) {
      this.levelCounts.push(0);
    }
    this.levelCounts[level]++;
  }

  private connectNode(newNode: HNSWNode): void {
    if (this.nodes.size === 1) {
      return; // First node, no connections needed
    }

    const profilerKey = `hnsw_connect_${newNode.id}`;
    globalProfiler.startOperation(profilerKey);

    try {
      // Find closest nodes at each level using greedy search
      let currentClosest = this.entryPoint!;
      const entryLevel = this.nodes.get(this.entryPoint!)!.level;

      // Search from top level down to the node's level + 1
      for (let level = entryLevel; level > newNode.level; level--) {
        currentClosest = this.greedySearchLayer(newNode.vector, currentClosest, 1, level)[0].id;
      }

      // Search and connect at each level from node's level down to 0
      for (let level = Math.min(newNode.level, entryLevel); level >= 0; level--) {
        const candidates = this.searchLayer(
          newNode.vector,
          [currentClosest],
          this.config.efConstruction,
          level
        );

        const connections = this.selectConnections(
          candidates,
          level === 0 ? this.config.maxConnections * 2 : this.config.maxConnections
        );

        // Bidirectional connections
        for (const candidate of connections) {
          this.addConnection(newNode.id, candidate.id, level);
          this.addConnection(candidate.id, newNode.id, level);

          // Prune connections if needed
          this.pruneConnections(candidate.id, level);
        }

        currentClosest = connections[0].id;
      }

      globalProfiler.endOperation(profilerKey, 1);
    } catch (error) {
      globalProfiler.endOperation(profilerKey, 0);
      throw error;
    }
  }

  private addConnection(nodeId1: string, nodeId2: string, level: number): void {
    const node1 = this.nodes.get(nodeId1);
    const node2 = this.nodes.get(nodeId2);

    if (node1 && node2 && node1.level >= level && node2.level >= level) {
      node1.connections.get(level)?.add(nodeId2);
    }
  }

  private pruneConnections(nodeId: string, level: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    const maxConnections = level === 0 ? this.config.maxConnections * 2 : this.config.maxConnections;
    const connections = node.connections.get(level);

    if (connections && connections.size > maxConnections) {
      // Convert connections to candidates and select best ones
      const candidates = Array.from(connections).map(id => ({
        id,
        distance: this.config.distanceFunction(node.vector, this.nodes.get(id)!.vector)
      }));

      const selected = this.selectConnections(candidates, maxConnections);
      const newConnections = new Set(selected.map(c => c.id));

      // Remove bidirectional connections for pruned nodes
      for (const removedId of connections) {
        if (!newConnections.has(removedId)) {
          this.nodes.get(removedId)?.connections.get(level)?.delete(nodeId);
        }
      }

      connections.clear();
      selected.forEach(c => connections.add(c.id));
    }
  }

  private selectConnections(candidates: SearchResult[], maxConnections: number): SearchResult[] {
    // Sort by distance and take best candidates
    const sorted = candidates
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxConnections);

    return sorted;
  }

  search(query: Float32Array, k: number = 10, ef?: number): SearchResult[] {
    if (this.nodes.size === 0 || !this.entryPoint) {
      return [];
    }

    const searchEf = ef || Math.max(this.config.efSearch, k);
    const profilerKey = `hnsw_search_k${k}`;

    globalProfiler.startOperation(profilerKey, { k, ef: searchEf });

    try {
      let currentClosest = this.entryPoint;
      const entryLevel = this.nodes.get(this.entryPoint)!.level;

      // Search from top level down to level 1
      for (let level = entryLevel; level > 0; level--) {
        const results = this.greedySearchLayer(query, currentClosest, 1, level);
        currentClosest = results[0].id;
      }

      // Search at level 0 with larger candidate list
      const finalCandidates = this.searchLayer(query, [currentClosest], searchEf, 0);
      const results = finalCandidates.slice(0, k);

      globalProfiler.endOperation(profilerKey, k);
      return results;
    } catch (error) {
      globalProfiler.endOperation(profilerKey, 0);
      throw error;
    }
  }

  private greedySearchLayer(
    query: Float32Array,
    entryPoint: string,
    numClosest: number,
    level: number
  ): SearchResult[] {
    const visited = new Set<string>();
    const candidates: SearchResult[] = [];
    const dynamic: SearchResult[] = [];

    // Initialize with entry point
    const entryDistance = this.config.distanceFunction(query, this.nodes.get(entryPoint)!.vector);
    candidates.push({ id: entryPoint, distance: entryDistance });
    dynamic.push({ id: entryPoint, distance: entryDistance });
    visited.add(entryPoint);

    while (dynamic.length > 0) {
      // Get closest unvisited candidate
      dynamic.sort((a, b) => a.distance - b.distance);
      const current = dynamic.shift()!;

      // If current is farther than the furthest in candidates, stop
      if (candidates.length >= numClosest) {
        candidates.sort((a, b) => a.distance - b.distance);
        if (current.distance > candidates[candidates.length - 1].distance) {
          break;
        }
      }

      // Explore neighbors
      const connections = this.nodes.get(current.id)?.connections.get(level);
      if (connections) {
        for (const neighborId of connections) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            const neighborDistance = this.config.distanceFunction(
              query,
              this.nodes.get(neighborId)!.vector
            );

            const neighbor = { id: neighborId, distance: neighborDistance };
            candidates.push(neighbor);
            dynamic.push(neighbor);
          }
        }
      }
    }

    // Return best candidates
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates.slice(0, numClosest);
  }

  private searchLayer(
    query: Float32Array,
    entryPoints: string[],
    ef: number,
    level: number
  ): SearchResult[] {
    const visited = new Set<string>();
    const candidates: SearchResult[] = [];
    const dynamic: SearchResult[] = [];

    // Initialize with entry points
    for (const entryPoint of entryPoints) {
      if (!visited.has(entryPoint)) {
        const distance = this.config.distanceFunction(query, this.nodes.get(entryPoint)!.vector);
        const result = { id: entryPoint, distance };
        candidates.push(result);
        dynamic.push(result);
        visited.add(entryPoint);
      }
    }

    while (dynamic.length > 0) {
      // Get closest candidate
      dynamic.sort((a, b) => a.distance - b.distance);
      const current = dynamic.shift()!;

      // If we have ef candidates and current is farther than the furthest, stop
      if (candidates.length >= ef) {
        candidates.sort((a, b) => a.distance - b.distance);
        if (current.distance > candidates[ef - 1].distance) {
          break;
        }
      }

      // Explore neighbors
      const connections = this.nodes.get(current.id)?.connections.get(level);
      if (connections) {
        for (const neighborId of connections) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            const neighborDistance = this.config.distanceFunction(
              query,
              this.nodes.get(neighborId)!.vector
            );

            const neighbor = { id: neighborId, distance: neighborDistance };

            // Add to candidates if we need more or it's better than the worst
            if (candidates.length < ef || neighborDistance < candidates[ef - 1].distance) {
              candidates.push(neighbor);
              dynamic.push(neighbor);

              // Keep candidates sorted and trim to ef
              if (candidates.length > ef) {
                candidates.sort((a, b) => a.distance - b.distance);
                candidates.splice(ef);
              }
            }
          }
        }
      }
    }

    candidates.sort((a, b) => a.distance - b.distance);
    return candidates;
  }

  // Batch insertion for better performance
  addNodesBatch(nodes: Array<{ id: string; vector: Float32Array; metadata?: any }>): void {
    const profilerKey = `hnsw_batch_insert`;
    globalProfiler.startOperation(profilerKey, { batchSize: nodes.length });

    try {
      // Sort by level to insert higher-level nodes first
      const sortedNodes = nodes.map(({ id, vector, metadata }) => ({
        id,
        vector,
        metadata,
        level: this.generateLevel()
      })).sort((a, b) => b.level - a.level);

      for (const nodeData of sortedNodes) {
        this.addNode(nodeData.id, nodeData.vector, nodeData.metadata);
      }

      globalProfiler.endOperation(profilerKey, nodes.length);
    } catch (error) {
      globalProfiler.endOperation(profilerKey, 0);
      throw error;
    }
  }

  // Remove node from index
  removeNode(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) {
      return false;
    }

    // Remove all connections to this node
    for (let level = 0; level <= node.level; level++) {
      const connections = node.connections.get(level);
      if (connections) {
        for (const connectedId of connections) {
          this.nodes.get(connectedId)?.connections.get(level)?.delete(id);
        }
      }
    }

    // Update level counts
    this.levelCounts[node.level]--;

    this.nodes.delete(id);

    // Update entry point if needed
    if (this.entryPoint === id) {
      this.findNewEntryPoint();
    }

    return true;
  }

  private findNewEntryPoint(): void {
    let maxLevel = -1;
    let newEntryPoint: string | null = null;

    for (const [id, node] of this.nodes) {
      if (node.level > maxLevel) {
        maxLevel = node.level;
        newEntryPoint = id;
      }
    }

    this.entryPoint = newEntryPoint;
  }

  // Range search
  searchRange(query: Float32Array, radius: number, maxResults: number = 100): SearchResult[] {
    if (this.nodes.size === 0) {
      return [];
    }

    // Start with regular search to find candidates
    const candidates = this.search(query, Math.min(maxResults * 2, this.config.efSearch * 2));

    // Filter by radius
    return candidates
      .filter(result => result.distance <= radius)
      .slice(0, maxResults);
  }

  getStats(): HNSWStats {
    let totalConnections = 0;
    let totalComparisons = 0;

    for (const node of this.nodes.values()) {
      for (const connections of node.connections.values()) {
        totalConnections += connections.size;
      }
    }

    return {
      nodeCount: this.nodes.size,
      levelDistribution: [...this.levelCounts],
      averageConnections: this.nodes.size > 0 ? totalConnections / this.nodes.size : 0,
      searchPerformance: {
        averageDistance: 0, // Would be calculated from search history
        averageComparisons: totalComparisons / Math.max(1, this.nodes.size)
      }
    };
  }

  // Optimize index after bulk operations
  optimize(): void {
    const profilerKey = 'hnsw_optimize';
    globalProfiler.startOperation(profilerKey);

    try {
      // Rebuild connections for better connectivity
      const nodes = Array.from(this.nodes.values());
      const nodeConnections = new Map<string, Map<number, Set<string>>>();

      // Save current connections
      for (const node of nodes) {
        nodeConnections.set(node.id, new Map(node.connections));
      }

      // Clear all connections
      for (const node of nodes) {
        node.connections.clear();
        for (let level = 0; level <= node.level; level++) {
          node.connections.set(level, new Set());
        }
      }

      // Reconnect nodes in level order (highest first)
      nodes.sort((a, b) => b.level - a.level);
      for (let i = 1; i < nodes.length; i++) {
        this.connectNode(nodes[i]);
      }

      globalProfiler.endOperation(profilerKey, nodes.length);
    } catch (error) {
      globalProfiler.endOperation(profilerKey, 0);
      throw error;
    }
  }

  // Serialize index for persistence
  serialize(): string {
    const serializable = {
      config: this.config,
      entryPoint: this.entryPoint,
      levelCounts: this.levelCounts,
      nodes: Array.from(this.nodes.entries()).map(([id, node]) => ({
        id,
        vector: Array.from(node.vector),
        level: node.level,
        connections: Object.fromEntries(
          Array.from(node.connections.entries()).map(([level, connections]) => [
            level,
            Array.from(connections)
          ])
        ),
        metadata: node.metadata
      }))
    };

    return JSON.stringify(serializable);
  }

  // Deserialize index from persistence
  deserialize(serialized: string): void {
    const data = JSON.parse(serialized);

    this.config = { ...this.config, ...data.config };
    this.entryPoint = data.entryPoint;
    this.levelCounts = data.levelCounts || [];

    this.nodes.clear();
    for (const nodeData of data.nodes) {
      const node: HNSWNode = {
        id: nodeData.id,
        vector: new Float32Array(nodeData.vector),
        level: nodeData.level,
        connections: new Map(),
        metadata: nodeData.metadata
      };

      // Rebuild connections map
      for (const [level, connections] of Object.entries(nodeData.connections)) {
        node.connections.set(parseInt(level), new Set(connections as string[]));
      }

      this.nodes.set(nodeData.id, node);
    }
  }

  clear(): void {
    this.nodes.clear();
    this.entryPoint = null;
    this.levelCounts = [];
  }
}

// Specialized HNSW for column anchor similarity search
export class ColumnAnchorHNSW {
  private hnsw: HierarchicalNavigableSmallWorld;
  private anchorVectors = new Map<string, Float32Array>();

  constructor() {
    this.hnsw = new HierarchicalNavigableSmallWorld({
      maxConnections: 32,
      efConstruction: 400,
      efSearch: 100,
      distanceFunction: this.columnSimilarityDistance
    });
  }

  private columnSimilarityDistance(a: Float32Array, b: Float32Array): number {
    // Weighted distance function for column similarity
    // Emphasizes statistical and semantic features

    let statisticalDiff = 0;
    let semanticDiff = 0;

    const halfLen = a.length / 2;

    // First half: statistical features (nulls, cardinality, etc.)
    for (let i = 0; i < halfLen; i++) {
      const diff = a[i] - b[i];
      statisticalDiff += diff * diff;
    }

    // Second half: semantic features (patterns, types, etc.)
    for (let i = halfLen; i < a.length; i++) {
      const diff = a[i] - b[i];
      semanticDiff += diff * diff;
    }

    // Weight semantic features more heavily
    return Math.sqrt(0.3 * statisticalDiff + 0.7 * semanticDiff);
  }

  addAnchor(anchorId: string, features: Float32Array, metadata?: any): void {
    this.anchorVectors.set(anchorId, new Float32Array(features));
    this.hnsw.addNode(anchorId, features, metadata);
  }

  findSimilarAnchors(
    queryFeatures: Float32Array,
    k: number = 10,
    threshold: number = 0.8
  ): Array<{ anchorId: string; similarity: number; metadata?: any }> {
    const results = this.hnsw.search(queryFeatures, k * 2); // Search more to filter

    return results
      .map(result => ({
        anchorId: result.id,
        similarity: 1 / (1 + result.distance), // Convert distance to similarity
        metadata: result.metadata
      }))
      .filter(result => result.similarity >= threshold)
      .slice(0, k);
  }

  optimize(): void {
    this.hnsw.optimize();
  }

  getStats() {
    return this.hnsw.getStats();
  }
}

// Global instances
export const globalHNSW = new HierarchicalNavigableSmallWorld({
  maxConnections: 16,
  efConstruction: 200,
  efSearch: 50
});

export const globalAnchorHNSW = new ColumnAnchorHNSW();