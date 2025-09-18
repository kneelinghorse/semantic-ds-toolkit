import { globalProfiler } from './performance-profiler';

interface PQCodebook {
  centroids: Float32Array[];
  subspaceDimension: number;
  numCentroids: number;
  subspaceCount: number;
}

interface CompressedVector {
  codes: Uint8Array;
  metadata: {
    originalDimension: number;
    subspaceCount: number;
    compressionRatio: number;
  };
}

interface PQConfig {
  subspaceCount: number;
  bitsPerCode: number;
  maxIterations: number;
  convergenceThreshold: number;
  initializationMethod: 'random' | 'kmeans++';
}

export class ProductQuantizer {
  private config: PQConfig;
  private codebooks: PQCodebook[] = [];
  private isTrained: boolean = false;

  constructor(config: Partial<PQConfig> = {}) {
    this.config = {
      subspaceCount: 8,
      bitsPerCode: 8, // 256 centroids per subspace
      maxIterations: 100,
      convergenceThreshold: 1e-4,
      initializationMethod: 'kmeans++',
      ...config
    };
  }

  async train(vectors: Float32Array[]): Promise<void> {
    if (vectors.length === 0) {
      throw new Error('Cannot train on empty vector set');
    }

    const profilerKey = 'pq_training';
    globalProfiler.startOperation(profilerKey, {
      vectorCount: vectors.length,
      vectorDimension: vectors[0].length,
      subspaceCount: this.config.subspaceCount
    });

    try {
      const dimension = vectors[0].length;
      const subspaceDimension = Math.floor(dimension / this.config.subspaceCount);
      const numCentroids = Math.pow(2, this.config.bitsPerCode);

      // Split vectors into subspaces
      const subspaces = this.splitVectorsIntoSubspaces(vectors, subspaceDimension);

      // Train codebook for each subspace
      this.codebooks = await Promise.all(
        subspaces.map((subspace, index) =>
          this.trainSubspaceCodebook(subspace, subspaceDimension, numCentroids, index)
        )
      );

      this.isTrained = true;
      globalProfiler.endOperation(profilerKey, vectors.length);
    } catch (error) {
      globalProfiler.endOperation(profilerKey, 0);
      throw error;
    }
  }

  private splitVectorsIntoSubspaces(
    vectors: Float32Array[],
    subspaceDimension: number
  ): Float32Array[][] {
    const subspaces: Float32Array[][] = [];

    for (let s = 0; s < this.config.subspaceCount; s++) {
      const subspace: Float32Array[] = [];
      const startDim = s * subspaceDimension;
      const endDim = Math.min(startDim + subspaceDimension, vectors[0].length);

      for (const vector of vectors) {
        const subvector = new Float32Array(endDim - startDim);
        for (let d = startDim; d < endDim; d++) {
          subvector[d - startDim] = vector[d];
        }
        subspace.push(subvector);
      }

      subspaces.push(subspace);
    }

    return subspaces;
  }

  private async trainSubspaceCodebook(
    subspace: Float32Array[],
    dimension: number,
    numCentroids: number,
    subspaceIndex: number
  ): Promise<PQCodebook> {
    // Initialize centroids using k-means++
    let centroids = this.initializeCentroids(subspace, numCentroids, dimension);
    let assignments = new Uint8Array(subspace.length);

    let prevCost = Infinity;
    let iteration = 0;

    while (iteration < this.config.maxIterations) {
      // Assignment step - assign each vector to nearest centroid
      let totalCost = 0;
      for (let i = 0; i < subspace.length; i++) {
        let minDistance = Infinity;
        let bestCentroid = 0;

        for (let c = 0; c < numCentroids; c++) {
          const distance = this.euclideanDistance(subspace[i], centroids[c]);
          if (distance < minDistance) {
            minDistance = distance;
            bestCentroid = c;
          }
        }

        assignments[i] = bestCentroid;
        totalCost += minDistance;
      }

      // Check convergence
      const costImprovement = (prevCost - totalCost) / prevCost;
      if (costImprovement < this.config.convergenceThreshold) {
        break;
      }
      prevCost = totalCost;

      // Update step - recompute centroids
      const newCentroids: Float32Array[] = [];
      for (let c = 0; c < numCentroids; c++) {
        const assignedVectors = subspace.filter((_, i) => assignments[i] === c);

        if (assignedVectors.length > 0) {
          newCentroids.push(this.computeMean(assignedVectors));
        } else {
          // Reinitialize empty centroid
          newCentroids.push(this.randomVector(dimension));
        }
      }

      centroids = newCentroids;
      iteration++;
    }

    return {
      centroids,
      subspaceDimension: dimension,
      numCentroids,
      subspaceCount: this.config.subspaceCount
    };
  }

  private initializeCentroids(
    vectors: Float32Array[],
    numCentroids: number,
    dimension: number
  ): Float32Array[] {
    if (this.config.initializationMethod === 'kmeans++') {
      return this.kMeansPlusPlusInit(vectors, numCentroids);
    } else {
      // Random initialization
      const centroids: Float32Array[] = [];
      for (let i = 0; i < numCentroids; i++) {
        centroids.push(this.randomVector(dimension));
      }
      return centroids;
    }
  }

  private kMeansPlusPlusInit(vectors: Float32Array[], numCentroids: number): Float32Array[] {
    const centroids: Float32Array[] = [];

    // Choose first centroid randomly
    const firstIndex = Math.floor(Math.random() * vectors.length);
    centroids.push(new Float32Array(vectors[firstIndex]));

    // Choose remaining centroids using k-means++ strategy
    for (let c = 1; c < numCentroids; c++) {
      const distances = new Float32Array(vectors.length);
      let totalDistance = 0;

      // Compute distance to nearest centroid for each vector
      for (let i = 0; i < vectors.length; i++) {
        let minDistance = Infinity;
        for (const centroid of centroids) {
          const distance = this.euclideanDistance(vectors[i], centroid);
          minDistance = Math.min(minDistance, distance);
        }
        distances[i] = minDistance * minDistance; // Square for weighting
        totalDistance += distances[i];
      }

      // Choose next centroid with probability proportional to squared distance
      const threshold = Math.random() * totalDistance;
      let cumulativeDistance = 0;
      for (let i = 0; i < vectors.length; i++) {
        cumulativeDistance += distances[i];
        if (cumulativeDistance >= threshold) {
          centroids.push(new Float32Array(vectors[i]));
          break;
        }
      }
    }

    return centroids;
  }

  private computeMean(vectors: Float32Array[]): Float32Array {
    const dimension = vectors[0].length;
    const mean = new Float32Array(dimension);

    for (const vector of vectors) {
      for (let d = 0; d < dimension; d++) {
        mean[d] += vector[d];
      }
    }

    for (let d = 0; d < dimension; d++) {
      mean[d] /= vectors.length;
    }

    return mean;
  }

  private randomVector(dimension: number): Float32Array {
    const vector = new Float32Array(dimension);
    for (let d = 0; d < dimension; d++) {
      vector[d] = (Math.random() - 0.5) * 2; // Range [-1, 1]
    }
    return vector;
  }

  private euclideanDistance(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  compress(vector: Float32Array): CompressedVector {
    if (!this.isTrained) {
      throw new Error('ProductQuantizer must be trained before compression');
    }

    const codes = new Uint8Array(this.config.subspaceCount);
    const subspaceDimension = Math.floor(vector.length / this.config.subspaceCount);

    for (let s = 0; s < this.config.subspaceCount; s++) {
      const startDim = s * subspaceDimension;
      const endDim = Math.min(startDim + subspaceDimension, vector.length);

      // Extract subvector
      const subvector = new Float32Array(endDim - startDim);
      for (let d = startDim; d < endDim; d++) {
        subvector[d - startDim] = vector[d];
      }

      // Find nearest centroid in this subspace
      const codebook = this.codebooks[s];
      let minDistance = Infinity;
      let bestCode = 0;

      for (let c = 0; c < codebook.centroids.length; c++) {
        const distance = this.euclideanDistance(subvector, codebook.centroids[c]);
        if (distance < minDistance) {
          minDistance = distance;
          bestCode = c;
        }
      }

      codes[s] = bestCode;
    }

    const originalSize = vector.length * 4; // 4 bytes per float32
    const compressedSize = codes.length; // 1 byte per code
    const compressionRatio = originalSize / compressedSize;

    return {
      codes,
      metadata: {
        originalDimension: vector.length,
        subspaceCount: this.config.subspaceCount,
        compressionRatio
      }
    };
  }

  decompress(compressed: CompressedVector): Float32Array {
    if (!this.isTrained) {
      throw new Error('ProductQuantizer must be trained before decompression');
    }

    const { codes, metadata } = compressed;
    const reconstructed = new Float32Array(metadata.originalDimension);
    const subspaceDimension = Math.floor(metadata.originalDimension / metadata.subspaceCount);

    for (let s = 0; s < metadata.subspaceCount; s++) {
      const code = codes[s];
      const codebook = this.codebooks[s];
      const centroid = codebook.centroids[code];

      const startDim = s * subspaceDimension;
      const endDim = Math.min(startDim + subspaceDimension, metadata.originalDimension);

      for (let d = 0; d < centroid.length && startDim + d < endDim; d++) {
        reconstructed[startDim + d] = centroid[d];
      }
    }

    return reconstructed;
  }

  // Batch compression for better performance
  compressBatch(vectors: Float32Array[]): CompressedVector[] {
    const profilerKey = 'pq_batch_compression';
    globalProfiler.startOperation(profilerKey, { batchSize: vectors.length });

    try {
      const compressed = vectors.map(vector => this.compress(vector));
      globalProfiler.endOperation(profilerKey, vectors.length);
      return compressed;
    } catch (error) {
      globalProfiler.endOperation(profilerKey, 0);
      throw error;
    }
  }

  // Approximate distance computation using compressed vectors
  approximateDistance(compressed1: CompressedVector, compressed2: CompressedVector): number {
    if (compressed1.codes.length !== compressed2.codes.length) {
      throw new Error('Compressed vectors must have same dimensionality');
    }

    let totalDistance = 0;
    for (let s = 0; s < compressed1.codes.length; s++) {
      const code1 = compressed1.codes[s];
      const code2 = compressed2.codes[s];

      if (code1 === code2) {
        // Same centroid, distance is 0
        continue;
      }

      const codebook = this.codebooks[s];
      const centroid1 = codebook.centroids[code1];
      const centroid2 = codebook.centroids[code2];

      const distance = this.euclideanDistance(centroid1, centroid2);
      totalDistance += distance * distance;
    }

    return Math.sqrt(totalDistance);
  }

  // Pre-compute distance lookup tables for faster similarity search
  buildDistanceTables(query: Float32Array): Float32Array[] {
    if (!this.isTrained) {
      throw new Error('ProductQuantizer must be trained before building distance tables');
    }

    const distanceTables: Float32Array[] = [];
    const subspaceDimension = Math.floor(query.length / this.config.subspaceCount);

    for (let s = 0; s < this.config.subspaceCount; s++) {
      const startDim = s * subspaceDimension;
      const endDim = Math.min(startDim + subspaceDimension, query.length);

      // Extract query subvector
      const querySubvector = new Float32Array(endDim - startDim);
      for (let d = startDim; d < endDim; d++) {
        querySubvector[d - startDim] = query[d];
      }

      // Compute distances to all centroids in this subspace
      const codebook = this.codebooks[s];
      const distances = new Float32Array(codebook.centroids.length);

      for (let c = 0; c < codebook.centroids.length; c++) {
        distances[c] = this.euclideanDistance(querySubvector, codebook.centroids[c]);
      }

      distanceTables.push(distances);
    }

    return distanceTables;
  }

  // Fast approximate similarity search using precomputed distance tables
  searchApproximate(
    distanceTables: Float32Array[],
    compressed: CompressedVector[],
    k: number = 10
  ): Array<{ index: number; distance: number }> {
    const distances = compressed.map((comp, index) => {
      let totalDistance = 0;
      for (let s = 0; s < comp.codes.length; s++) {
        const code = comp.codes[s];
        totalDistance += distanceTables[s][code] * distanceTables[s][code];
      }
      return { index, distance: Math.sqrt(totalDistance) };
    });

    return distances
      .sort((a, b) => a.distance - b.distance)
      .slice(0, k);
  }

  getCompressionStats(): {
    subspaceCount: number;
    bitsPerCode: number;
    totalCentroids: number;
    memoryReduction: number;
    isTrained: boolean;
  } {
    const totalCentroids = this.codebooks.reduce(
      (sum, codebook) => sum + codebook.numCentroids, 0
    );

    // Original: 4 bytes per dimension
    // Compressed: 1 byte per subspace
    const memoryReduction = this.config.subspaceCount > 0 ?
      (4 * this.config.subspaceCount) / this.config.subspaceCount : 1;

    return {
      subspaceCount: this.config.subspaceCount,
      bitsPerCode: this.config.bitsPerCode,
      totalCentroids,
      memoryReduction,
      isTrained: this.isTrained
    };
  }

  // Serialize codebooks for persistence
  serialize(): string {
    if (!this.isTrained) {
      throw new Error('Cannot serialize untrained quantizer');
    }

    const serializable = {
      config: this.config,
      codebooks: this.codebooks.map(codebook => ({
        centroids: codebook.centroids.map(centroid => Array.from(centroid)),
        subspaceDimension: codebook.subspaceDimension,
        numCentroids: codebook.numCentroids,
        subspaceCount: codebook.subspaceCount
      }))
    };

    return JSON.stringify(serializable);
  }

  // Deserialize codebooks from persistence
  deserialize(serialized: string): void {
    const data = JSON.parse(serialized);
    this.config = data.config;
    this.codebooks = data.codebooks.map((codebook: any) => ({
      centroids: codebook.centroids.map((centroid: number[]) => new Float32Array(centroid)),
      subspaceDimension: codebook.subspaceDimension,
      numCentroids: codebook.numCentroids,
      subspaceCount: codebook.subspaceCount
    }));
    this.isTrained = true;
  }
}

// Optimized vector quantization for column fingerprints
export class ColumnFingerprintCompressor {
  private pq: ProductQuantizer;
  private compressedFingerprints = new Map<string, CompressedVector>();

  constructor(subspaceCount: number = 16) {
    this.pq = new ProductQuantizer({
      subspaceCount,
      bitsPerCode: 8,
      maxIterations: 50,
      convergenceThreshold: 1e-3
    });
  }

  async trainOnFingerprints(fingerprints: Map<string, Float32Array>): Promise<void> {
    const vectors = Array.from(fingerprints.values());
    await this.pq.train(vectors);

    // Pre-compress all training fingerprints
    for (const [id, vector] of fingerprints.entries()) {
      this.compressedFingerprints.set(id, this.pq.compress(vector));
    }
  }

  compressFingerprint(id: string, fingerprint: Float32Array): CompressedVector {
    const compressed = this.pq.compress(fingerprint);
    this.compressedFingerprints.set(id, compressed);
    return compressed;
  }

  findSimilarFingerprints(
    queryFingerprint: Float32Array,
    threshold: number = 0.8,
    maxResults: number = 100
  ): Array<{ id: string; similarity: number }> {
    const distanceTables = this.pq.buildDistanceTables(queryFingerprint);
    const compressedArray = Array.from(this.compressedFingerprints.entries());

    const results = this.pq.searchApproximate(
      distanceTables,
      compressedArray.map(([_, compressed]) => compressed),
      maxResults
    );

    return results
      .map(({ index, distance }) => ({
        id: compressedArray[index][0],
        similarity: 1 / (1 + distance) // Convert distance to similarity
      }))
      .filter(result => result.similarity >= threshold);
  }

  getCompressionRatio(): number {
    if (this.compressedFingerprints.size === 0) return 1;

    const sample = this.compressedFingerprints.values().next().value;
    return sample ? sample.metadata.compressionRatio : 1;
  }

  clear(): void {
    this.compressedFingerprints.clear();
  }
}

// Global instances for reuse
export const globalProductQuantizer = new ProductQuantizer({
  subspaceCount: 8,
  bitsPerCode: 8,
  maxIterations: 100
});

export const globalFingerprintCompressor = new ColumnFingerprintCompressor(16);