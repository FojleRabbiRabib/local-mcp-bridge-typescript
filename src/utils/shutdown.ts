import { Server } from 'http';
import { Socket } from 'net';
import { logger } from './logger.js';

export class GracefulShutdown {
  private isShuttingDown = false;
  private connections = new Set<Socket>();

  constructor(
    private server: Server,
    private cleanupCallback: () => Promise<void>
  ) {
    this.setupSignalHandlers();
    this.trackConnections();
  }

  private setupSignalHandlers() {
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      this.shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', { reason });
      this.shutdown('unhandledRejection');
    });
  }

  private trackConnections() {
    this.server.on('connection', (conn) => {
      this.connections.add(conn);
      conn.on('close', () => {
        this.connections.delete(conn);
      });
    });
  }

  async shutdown(signal: string) {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    // Stop accepting new connections
    this.server.close(() => {
      logger.info('HTTP server closed');
    });

    // Close existing connections after timeout
    setTimeout(() => {
      logger.warn('Forcing connection closure');
      this.connections.forEach((conn) => conn.destroy());
    }, 10000); // 10 second timeout

    try {
      // Run cleanup callback
      await this.cleanupCallback();

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error });
      process.exit(1);
    }
  }
}
