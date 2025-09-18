import { EventEmitter } from 'events';
import { globalProfiler } from './performance-profiler';

interface ConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  connectionTimeout: number;
  queryTimeout: number;
  ssl?: boolean;
  schema?: string;
}

interface PoolConfig {
  minConnections: number;
  maxConnections: number;
  acquireTimeout: number;
  idleTimeout: number;
  maxLifetime: number;
  healthCheckInterval: number;
  reconnectInterval: number;
  maxReconnectAttempts: number;
}

interface Connection {
  id: string;
  config: ConnectionConfig;
  isConnected: boolean;
  isIdle: boolean;
  lastUsed: number;
  createdAt: number;
  queryCount: number;
  errorCount: number;
  // In a real implementation, this would be the actual connection object
  nativeConnection?: any;
}

interface QueryResult {
  rows: any[];
  rowCount: number;
  executionTime: number;
  columns: string[];
}

interface PoolStats {
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
  queuedRequests: number;
  totalQueries: number;
  averageQueryTime: number;
  errorRate: number;
}

interface QueryOptions {
  timeout?: number;
  priority?: 'high' | 'medium' | 'low';
  retryAttempts?: number;
  cacheable?: boolean;
}

interface QueuedRequest {
  id: string;
  resolve: (connection: Connection) => void;
  reject: (error: Error) => void;
  timestamp: number;
  priority: 'high' | 'medium' | 'low';
  timeout: number;
}

export class ConnectionPool extends EventEmitter {
  private config: PoolConfig;
  private connectionConfigs: ConnectionConfig[];
  private connections: Map<string, Connection> = new Map();
  private availableConnections: Connection[] = [];
  private requestQueue: QueuedRequest[] = [];
  private stats: PoolStats = {
    totalConnections: 0,
    idleConnections: 0,
    activeConnections: 0,
    queuedRequests: 0,
    totalQueries: 0,
    averageQueryTime: 0,
    errorRate: 0
  };
  private healthCheckTimer?: NodeJS.Timeout;
  private isShuttingDown = false;

  constructor(
    connectionConfigs: ConnectionConfig | ConnectionConfig[],
    poolConfig: Partial<PoolConfig> = {}
  ) {
    super();

    this.connectionConfigs = Array.isArray(connectionConfigs) ? connectionConfigs : [connectionConfigs];
    this.config = {
      minConnections: 2,
      maxConnections: 20,
      acquireTimeout: 30000,
      idleTimeout: 300000, // 5 minutes
      maxLifetime: 1800000, // 30 minutes
      healthCheckInterval: 60000, // 1 minute
      reconnectInterval: 5000,
      maxReconnectAttempts: 3,
      ...poolConfig
    };

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Create minimum connections
      for (let i = 0; i < this.config.minConnections; i++) {
        await this.createConnection();
      }

      // Start health check timer
      this.startHealthCheck();

      this.emit('initialized', { connectionCount: this.connections.size });
    } catch (error) {
      this.emit('error', error);
    }
  }

  private async createConnection(): Promise<Connection> {
    if (this.connections.size >= this.config.maxConnections) {
      throw new Error('Maximum connection limit reached');
    }

    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const config = this.selectConnectionConfig();

    const connection: Connection = {
      id: connectionId,
      config,
      isConnected: false,
      isIdle: true,
      lastUsed: Date.now(),
      createdAt: Date.now(),
      queryCount: 0,
      errorCount: 0
    };

    try {
      // Simulate connection creation - in real implementation, connect to database
      await this.simulateConnection(connection);

      connection.isConnected = true;
      this.connections.set(connectionId, connection);
      this.availableConnections.push(connection);

      this.stats.totalConnections++;
      this.stats.idleConnections++;

      this.emit('connectionCreated', { connectionId });
      return connection;
    } catch (error) {
      this.emit('connectionError', { connectionId, error });
      throw error;
    }
  }

  private selectConnectionConfig(): ConnectionConfig {
    // Round-robin selection for load balancing
    const index = this.connections.size % this.connectionConfigs.length;
    return this.connectionConfigs[index];
  }

  private async simulateConnection(connection: Connection): Promise<void> {
    // Simulate database connection time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));

    // In real implementation, create actual database connection:
    // connection.nativeConnection = await createDatabaseConnection(connection.config);
  }

  async acquireConnection(timeout?: number): Promise<Connection> {
    const acquireTimeout = timeout || this.config.acquireTimeout;
    const profilerKey = 'connection_acquire';

    globalProfiler.startOperation(profilerKey);

    try {
      // Check for available connection
      const availableConnection = this.getAvailableConnection();
      if (availableConnection) {
        this.markConnectionBusy(availableConnection);
        globalProfiler.endOperation(profilerKey, 1);
        return availableConnection;
      }

      // Try to create new connection if under limit
      if (this.connections.size < this.config.maxConnections) {
        const newConnection = await this.createConnection();
        this.markConnectionBusy(newConnection);
        globalProfiler.endOperation(profilerKey, 1);
        return newConnection;
      }

      // Queue the request
      const queuedRequest = await this.queueConnectionRequest(acquireTimeout);
      globalProfiler.endOperation(profilerKey, 1);
      return queuedRequest;
    } catch (error) {
      globalProfiler.endOperation(profilerKey, 0);
      throw error;
    }
  }

  private getAvailableConnection(): Connection | null {
    const available = this.availableConnections.find(conn =>
      conn.isConnected && conn.isIdle && this.isConnectionHealthy(conn)
    );

    if (available) {
      // Remove from available pool
      const index = this.availableConnections.indexOf(available);
      this.availableConnections.splice(index, 1);
    }

    return available || null;
  }

  private isConnectionHealthy(connection: Connection): boolean {
    const now = Date.now();
    const age = now - connection.createdAt;
    const idleTime = now - connection.lastUsed;

    // Check if connection is too old or idle too long
    if (age > this.config.maxLifetime || idleTime > this.config.idleTimeout) {
      return false;
    }

    // Check error rate
    if (connection.errorCount > 0 && connection.errorCount / connection.queryCount > 0.1) {
      return false;
    }

    return true;
  }

  private markConnectionBusy(connection: Connection): void {
    connection.isIdle = false;
    connection.lastUsed = Date.now();
    this.stats.idleConnections--;
    this.stats.activeConnections++;
  }

  private async queueConnectionRequest(timeout: number): Promise<Connection> {
    return new Promise((resolve, reject) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const queuedRequest: QueuedRequest = {
        id: requestId,
        resolve,
        reject,
        timestamp: Date.now(),
        priority: 'medium',
        timeout
      };

      this.requestQueue.push(queuedRequest);
      this.stats.queuedRequests++;

      // Sort queue by priority and timestamp
      this.requestQueue.sort((a, b) => {
        const priorityWeight = { high: 3, medium: 2, low: 1 };
        const aPriority = priorityWeight[a.priority];
        const bPriority = priorityWeight[b.priority];

        if (aPriority !== bPriority) {
          return bPriority - aPriority; // Higher priority first
        }

        return a.timestamp - b.timestamp; // FIFO for same priority
      });

      // Set timeout
      setTimeout(() => {
        const index = this.requestQueue.findIndex(req => req.id === requestId);
        if (index >= 0) {
          this.requestQueue.splice(index, 1);
          this.stats.queuedRequests--;
          reject(new Error(`Connection acquisition timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  releaseConnection(connection: Connection): void {
    if (!connection.isIdle) {
      connection.isIdle = true;
      connection.lastUsed = Date.now();

      this.stats.activeConnections--;
      this.stats.idleConnections++;

      // Check if connection is still healthy
      if (this.isConnectionHealthy(connection)) {
        this.availableConnections.push(connection);

        // Process queued requests
        this.processQueuedRequests();
      } else {
        // Remove unhealthy connection
        this.removeConnection(connection);

        // Ensure minimum connections
        this.ensureMinimumConnections();
      }
    }
  }

  private processQueuedRequests(): void {
    while (this.requestQueue.length > 0 && this.availableConnections.length > 0) {
      const request = this.requestQueue.shift()!;
      const connection = this.getAvailableConnection();

      if (connection) {
        this.markConnectionBusy(connection);
        this.stats.queuedRequests--;
        request.resolve(connection);
      } else {
        // Put request back if no connection available
        this.requestQueue.unshift(request);
        break;
      }
    }
  }

  private removeConnection(connection: Connection): void {
    this.connections.delete(connection.id);

    // Remove from available pool
    const index = this.availableConnections.indexOf(connection);
    if (index >= 0) {
      this.availableConnections.splice(index, 1);
    }

    // Close native connection
    this.closeNativeConnection(connection);

    this.stats.totalConnections--;
    if (connection.isIdle) {
      this.stats.idleConnections--;
    } else {
      this.stats.activeConnections--;
    }

    this.emit('connectionRemoved', { connectionId: connection.id });
  }

  private closeNativeConnection(connection: Connection): void {
    // In real implementation, close actual database connection
    if (connection.nativeConnection) {
      // connection.nativeConnection.close();
    }
  }

  private async ensureMinimumConnections(): Promise<void> {
    const currentConnections = this.connections.size;
    const needed = this.config.minConnections - currentConnections;

    if (needed > 0) {
      const createPromises = [];
      for (let i = 0; i < needed; i++) {
        createPromises.push(this.createConnection().catch(err => {
          this.emit('error', err);
        }));
      }

      await Promise.allSettled(createPromises);
    }
  }

  // High-level query execution
  async executeQuery(sql: string, params?: any[], options: QueryOptions = {}): Promise<QueryResult> {
    const profilerKey = 'query_execution';
    globalProfiler.startOperation(profilerKey, { sql: sql.substring(0, 100) });

    let connection: Connection | null = null;

    try {
      connection = await this.acquireConnection(options.timeout);

      const result = await this.runQuery(connection, sql, params, options);

      this.updateQueryStats(connection, result.executionTime, false);
      globalProfiler.endOperation(profilerKey, 1);

      return result;
    } catch (error) {
      if (connection) {
        this.updateQueryStats(connection, 0, true);
      }
      globalProfiler.endOperation(profilerKey, 0);
      throw error;
    } finally {
      if (connection) {
        this.releaseConnection(connection);
      }
    }
  }

  private async runQuery(
    connection: Connection,
    sql: string,
    params?: any[],
    options: QueryOptions = {}
  ): Promise<QueryResult> {
    const startTime = Date.now();

    // Simulate query execution - in real implementation, use actual database query
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 10));

    const executionTime = Date.now() - startTime;

    // Mock result - in real implementation, return actual query results
    const result: QueryResult = {
      rows: this.generateMockRows(sql),
      rowCount: Math.floor(Math.random() * 1000) + 1,
      executionTime,
      columns: this.extractColumns(sql)
    };

    return result;
  }

  private generateMockRows(sql: string): any[] {
    // Generate mock data based on query type
    const rowCount = Math.floor(Math.random() * 100) + 1;
    const rows = [];

    for (let i = 0; i < rowCount; i++) {
      rows.push({
        id: i + 1,
        name: `item_${i}`,
        value: Math.random() * 1000,
        created_at: new Date()
      });
    }

    return rows;
  }

  private extractColumns(sql: string): string[] {
    // Mock column extraction - in real implementation, get from query metadata
    return ['id', 'name', 'value', 'created_at'];
  }

  private updateQueryStats(connection: Connection, executionTime: number, isError: boolean): void {
    connection.queryCount++;
    if (isError) {
      connection.errorCount++;
    }

    this.stats.totalQueries++;
    this.stats.averageQueryTime =
      (this.stats.averageQueryTime * (this.stats.totalQueries - 1) + executionTime) / this.stats.totalQueries;

    if (isError) {
      this.stats.errorRate =
        (this.stats.errorRate * (this.stats.totalQueries - 1) + 1) / this.stats.totalQueries;
    } else {
      this.stats.errorRate =
        (this.stats.errorRate * (this.stats.totalQueries - 1)) / this.stats.totalQueries;
    }
  }

  // Batch query execution
  async executeBatch(queries: Array<{ sql: string; params?: any[] }>): Promise<QueryResult[]> {
    const profilerKey = 'batch_query_execution';
    globalProfiler.startOperation(profilerKey, { batchSize: queries.length });

    try {
      // Acquire connections for parallel execution
      const connectionPromises = queries.map(() => this.acquireConnection());
      const connections = await Promise.all(connectionPromises);

      // Execute queries in parallel
      const resultPromises = queries.map((query, index) =>
        this.runQuery(connections[index], query.sql, query.params)
      );

      const results = await Promise.all(resultPromises);

      // Release all connections
      connections.forEach(conn => this.releaseConnection(conn));

      globalProfiler.endOperation(profilerKey, queries.length);
      return results;
    } catch (error) {
      globalProfiler.endOperation(profilerKey, 0);
      throw error;
    }
  }

  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  private async performHealthCheck(): Promise<void> {
    if (this.isShuttingDown) return;

    const unhealthyConnections: Connection[] = [];

    for (const connection of this.connections.values()) {
      if (!this.isConnectionHealthy(connection)) {
        unhealthyConnections.push(connection);
      }
    }

    // Remove unhealthy connections
    for (const connection of unhealthyConnections) {
      if (connection.isIdle) {
        this.removeConnection(connection);
      } else {
        // Mark for removal when released
        connection.errorCount = Number.MAX_SAFE_INTEGER;
      }
    }

    // Ensure minimum connections
    await this.ensureMinimumConnections();

    this.emit('healthCheck', {
      totalConnections: this.connections.size,
      removedConnections: unhealthyConnections.length
    });
  }

  getStats(): PoolStats {
    return { ...this.stats };
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Clear health check timer
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    // Reject queued requests
    for (const request of this.requestQueue) {
      request.reject(new Error('Connection pool is shutting down'));
    }
    this.requestQueue = [];

    // Close all connections
    const closePromises = Array.from(this.connections.values()).map(async connection => {
      // Wait for active connections to finish (with timeout)
      const timeout = 10000; // 10 seconds
      const start = Date.now();

      while (!connection.isIdle && Date.now() - start < timeout) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      this.closeNativeConnection(connection);
    });

    await Promise.allSettled(closePromises);

    this.connections.clear();
    this.availableConnections = [];

    this.emit('shutdown');
  }
}

// Warehouse-specific connection pool with optimizations
export class WarehouseConnectionPool extends ConnectionPool {
  private queryCache = new Map<string, { result: QueryResult; timestamp: number; ttl: number }>();

  constructor(
    connectionConfigs: ConnectionConfig | ConnectionConfig[],
    poolConfig?: Partial<PoolConfig>
  ) {
    super(connectionConfigs, {
      minConnections: 5,
      maxConnections: 50, // Higher for data warehouse workloads
      acquireTimeout: 60000, // Longer timeout for complex queries
      idleTimeout: 600000, // 10 minutes
      maxLifetime: 3600000, // 1 hour
      ...poolConfig
    });
  }

  async executeQuery(sql: string, params?: any[], options: QueryOptions = {}): Promise<QueryResult> {
    // Check cache for SELECT queries
    if (options.cacheable && sql.trim().toLowerCase().startsWith('select')) {
      const cacheKey = this.getCacheKey(sql, params);
      const cached = this.getCachedResult(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const result = await super.executeQuery(sql, params, options);

    // Cache SELECT results
    if (options.cacheable && sql.trim().toLowerCase().startsWith('select')) {
      const cacheKey = this.getCacheKey(sql, params);
      this.cacheResult(cacheKey, result, 300000); // 5 minutes TTL
    }

    return result;
  }

  private getCacheKey(sql: string, params?: any[]): string {
    return `${sql}|${JSON.stringify(params || [])}`;
  }

  private getCachedResult(cacheKey: string): QueryResult | null {
    const cached = this.queryCache.get(cacheKey);
    if (!cached) return null;

    if (Date.now() > cached.timestamp + cached.ttl) {
      this.queryCache.delete(cacheKey);
      return null;
    }

    return cached.result;
  }

  private cacheResult(cacheKey: string, result: QueryResult, ttl: number): void {
    this.queryCache.set(cacheKey, {
      result: { ...result }, // Clone to prevent mutations
      timestamp: Date.now(),
      ttl
    });

    // Cleanup old cache entries periodically
    if (this.queryCache.size > 1000) {
      this.cleanupCache();
    }
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, cached] of this.queryCache.entries()) {
      if (now > cached.timestamp + cached.ttl) {
        this.queryCache.delete(key);
      }
    }
  }
}

// Factory function for creating optimized pools
export function createOptimizedPool(
  type: 'oltp' | 'olap' | 'mixed',
  connectionConfigs: ConnectionConfig | ConnectionConfig[]
): ConnectionPool {
  const baseConfig = {
    oltp: {
      minConnections: 10,
      maxConnections: 100,
      acquireTimeout: 5000,
      idleTimeout: 180000, // 3 minutes
      maxLifetime: 900000  // 15 minutes
    },
    olap: {
      minConnections: 3,
      maxConnections: 20,
      acquireTimeout: 60000,
      idleTimeout: 1800000, // 30 minutes
      maxLifetime: 7200000  // 2 hours
    },
    mixed: {
      minConnections: 5,
      maxConnections: 50,
      acquireTimeout: 30000,
      idleTimeout: 600000,  // 10 minutes
      maxLifetime: 1800000  // 30 minutes
    }
  };

  const config = baseConfig[type];

  if (type === 'olap') {
    return new WarehouseConnectionPool(connectionConfigs, config);
  } else {
    return new ConnectionPool(connectionConfigs, config);
  }
}

// Global pool instances would be created based on configuration
export function createGlobalPools(configs: {
  oltp?: ConnectionConfig | ConnectionConfig[];
  olap?: ConnectionConfig | ConnectionConfig[];
  mixed?: ConnectionConfig | ConnectionConfig[];
}): {
  oltpPool?: ConnectionPool;
  olapPool?: WarehouseConnectionPool;
  mixedPool?: ConnectionPool;
} {
  const pools: any = {};

  if (configs.oltp) {
    pools.oltpPool = createOptimizedPool('oltp', configs.oltp);
  }

  if (configs.olap) {
    pools.olapPool = createOptimizedPool('olap', configs.olap);
  }

  if (configs.mixed) {
    pools.mixedPool = createOptimizedPool('mixed', configs.mixed);
  }

  return pools;
}