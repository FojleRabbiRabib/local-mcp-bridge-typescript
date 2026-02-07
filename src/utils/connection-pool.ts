import { logger } from './logger.js';
import { env } from '../config/environment.js';

interface Session {
  id: string;
  type: 'bridge' | 'agent';
  createdAt: number;
  lastActivity: number;
  metadata: Record<string, unknown>;
  cleanup: () => Promise<void>;
}

export class ConnectionPool {
  private sessions: Map<string, Session> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private stats = {
    totalSessionsCreated: 0,
    totalSessionsClosed: 0,
    maxConcurrentSessions: 0,
  };

  constructor() {
    this.startCleanupInterval();
  }

  public addSession(
    id: string,
    type: 'bridge' | 'agent',
    metadata: Record<string, unknown>,
    cleanup: () => Promise<void>
  ) {
    const now = Date.now();
    const session: Session = {
      id,
      type,
      createdAt: now,
      lastActivity: now,
      metadata,
      cleanup,
    };

    this.sessions.set(id, session);
    this.stats.totalSessionsCreated++;

    // Update max concurrent sessions
    const currentCount = this.sessions.size;
    if (currentCount > this.stats.maxConcurrentSessions) {
      this.stats.maxConcurrentSessions = currentCount;
    }

    logger.debug('Session added to pool', {
      sessionId: id,
      type,
      totalSessions: currentCount,
    });

    return session;
  }

  public getSession(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (session) {
      session.lastActivity = Date.now();
    }
    return session;
  }

  public removeSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) {
      return false;
    }

    this.sessions.delete(id);
    this.stats.totalSessionsClosed++;

    logger.debug('Session removed from pool', {
      sessionId: id,
      duration: Date.now() - session.createdAt,
      remainingSessions: this.sessions.size,
    });

    return true;
  }

  public async cleanupSession(id: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session) {
      return false;
    }

    try {
      await session.cleanup();
      this.removeSession(id);
      logger.info('Session cleaned up successfully', { sessionId: id });
      return true;
    } catch (error) {
      // Still remove session from pool even if cleanup fails
      this.removeSession(id);
      logger.error('Failed to cleanup session', {
        sessionId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  public updateActivity(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) {
      return false;
    }
    session.lastActivity = Date.now();
    return true;
  }

  private startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleSessions();
    }, 30000); // Run every 30 seconds
  }

  private cleanupStaleSessions() {
    const now = Date.now();
    const staleSessions: string[] = [];

    for (const [id, session] of this.sessions) {
      const inactiveTime = now - session.lastActivity;
      if (inactiveTime > env.SESSION_TIMEOUT) {
        staleSessions.push(id);
        logger.warn('Stale session detected', {
          sessionId: id,
          inactiveTime,
          type: session.type,
        });
      }
    }

    // Clean up stale sessions
    for (const id of staleSessions) {
      this.cleanupSession(id).catch(() => {
        // Error already logged in cleanupSession
      });
    }

    if (staleSessions.length > 0) {
      logger.info(`Cleaned up ${staleSessions.length} stale sessions`);
    }
  }

  public getStats() {
    const now = Date.now();
    const sessionsByType: Record<string, number> = {};
    const averageAgeByType: Record<string, number> = {};
    const ageCounts: Record<string, number> = {};
    const ageSums: Record<string, number> = {};

    for (const session of this.sessions.values()) {
      sessionsByType[session.type] = (sessionsByType[session.type] || 0) + 1;
      const age = now - session.createdAt;
      ageSums[session.type] = (ageSums[session.type] || 0) + age;
      ageCounts[session.type] = (ageCounts[session.type] || 0) + 1;
    }

    for (const type in ageSums) {
      averageAgeByType[type] = ageSums[type] / ageCounts[type];
    }

    return {
      currentSessions: this.sessions.size,
      sessionsByType,
      averageAgeByType,
      ...this.stats,
    };
  }

  public getAllSessions() {
    return Array.from(this.sessions.values());
  }

  public async shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    const sessionIds = Array.from(this.sessions.keys());
    logger.info(`Shutting down connection pool, closing ${sessionIds.length} sessions`);

    const cleanupPromises = sessionIds.map((id) => this.cleanupSession(id));
    const results = await Promise.all(cleanupPromises);

    const successful = results.filter((r) => r === true).length;
    const failed = results.filter((r) => r === false).length;

    logger.info('Connection pool shutdown complete', {
      successful,
      failed,
      total: sessionIds.length,
    });

    return { successful, failed, total: sessionIds.length };
  }

  public getCurrentCount() {
    return this.sessions.size;
  }

  public hasSession(id: string): boolean {
    return this.sessions.has(id);
  }
}

// Singleton instance
export const connectionPool = new ConnectionPool();
