/**
 * 🛡️ Graceful Shutdown Manager
 *
 * Handles graceful shutdown of the MCP Weather Server, ensuring:
 * - Existing requests complete before shutdown
 * - Resources are properly cleaned up
 * - Cache data is persisted if needed
 * - Proper exit codes and logging
 */

import { Server } from 'http';
import { logger } from './logger.js';

export interface ShutdownManager {
  server?: Server;
  cleanup?: (() => Promise<void> | void)[];
}

export class GracefulShutdown {
  private static instance: GracefulShutdown;
  private managers: ShutdownManager[] = [];
  private shutdownInProgress = false;
  private shutdownTimeout: number;

  constructor(shutdownTimeout: number = 10000) {
    this.shutdownTimeout = shutdownTimeout;
  }

  static getInstance(shutdownTimeout?: number): GracefulShutdown {
    if (!GracefulShutdown.instance) {
      GracefulShutdown.instance = new GracefulShutdown(shutdownTimeout);
    }
    return GracefulShutdown.instance;
  }

  /**
   * Register a server and cleanup functions for graceful shutdown
   */
  register(manager: ShutdownManager): void {
    this.managers.push(manager);
    logger.debug('Registered shutdown manager', {
      operation: 'shutdown_registration',
      managersCount: this.managers.length
    });
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  setupSignalHandlers(): void {
    // Handle SIGTERM (Docker, Kubernetes, systemd)
    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM signal', {
        operation: 'signal_handler',
        signal: 'SIGTERM',
        recommendation: 'Initiating graceful shutdown'
      });
      this.initiateShutdown('SIGTERM');
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      logger.info('Received SIGINT signal', {
        operation: 'signal_handler',
        signal: 'SIGINT',
        recommendation: 'Initiating graceful shutdown'
      });
      this.initiateShutdown('SIGINT');
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception occurred', {
        operation: 'uncaught_exception',
        recommendation: 'Fix the error and restart the server'
      }, error);
      this.initiateShutdown('UNCAUGHT_EXCEPTION', 1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled promise rejection', {
        operation: 'unhandled_rejection',
        reason: String(reason),
        recommendation: 'Add proper error handling to promises'
      });
      this.initiateShutdown('UNHANDLED_REJECTION', 1);
    });

    logger.info('Signal handlers registered', {
      operation: 'signal_setup',
      signals: ['SIGTERM', 'SIGINT', 'uncaughtException', 'unhandledRejection']
    });
  }

  /**
   * Initiate graceful shutdown process
   */
  private async initiateShutdown(reason: string, exitCode: number = 0): Promise<void> {
    if (this.shutdownInProgress) {
      logger.warn('Shutdown already in progress', {
        operation: 'shutdown_duplicate',
        reason,
        recommendation: 'Wait for current shutdown to complete'
      });
      return;
    }

    this.shutdownInProgress = true;
    const startTime = Date.now();

    logger.info('Starting graceful shutdown', {
      operation: 'shutdown_start',
      reason,
      timeout: this.shutdownTimeout,
      managersCount: this.managers.length
    });

    try {
      // Set up shutdown timeout
      const shutdownTimeoutHandle = setTimeout(() => {
        logger.error('Shutdown timeout exceeded', {
          operation: 'shutdown_timeout',
          timeout: this.shutdownTimeout,
          recommendation: 'Force killing process'
        });
        process.exit(1);
      }, this.shutdownTimeout);

      // Stop accepting new connections and close existing ones
      await this.closeServers();

      // Run cleanup functions
      await this.runCleanup();

      // Clear the timeout
      clearTimeout(shutdownTimeoutHandle);

      const shutdownDuration = Date.now() - startTime;
      logger.info('Graceful shutdown completed', {
        operation: 'shutdown_complete',
        reason,
        duration: shutdownDuration,
        exitCode
      });

      process.exit(exitCode);
    } catch (error) {
      logger.error('Error during graceful shutdown', {
        operation: 'shutdown_error',
        reason,
        recommendation: 'Check server cleanup logic'
      }, error as Error);
      process.exit(1);
    }
  }

  /**
   * Close all registered servers
   */
  private async closeServers(): Promise<void> {
    const serverPromises = this.managers
      .filter(manager => manager.server)
      .map(manager => this.closeServer(manager.server!));

    if (serverPromises.length > 0) {
      logger.info('Closing HTTP servers', {
        operation: 'server_shutdown',
        serversCount: serverPromises.length
      });
      await Promise.all(serverPromises);
    }
  }

  /**
   * Close a single HTTP server
   */
  private closeServer(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
      const closeTimeout = setTimeout(() => {
        reject(new Error('Server close timeout'));
      }, this.shutdownTimeout - 1000); // Leave 1s buffer

      server.close((error) => {
        clearTimeout(closeTimeout);
        if (error) {
          logger.error('Error closing server', {
            operation: 'server_close_error'
          }, error);
          reject(error);
        } else {
          logger.info('Server closed successfully', {
            operation: 'server_close_success'
          });
          resolve();
        }
      });
    });
  }

  /**
   * Run all cleanup functions
   */
  private async runCleanup(): Promise<void> {
    const cleanupFunctions = this.managers
      .filter(manager => manager.cleanup && manager.cleanup.length > 0)
      .flatMap(manager => manager.cleanup!);

    if (cleanupFunctions.length > 0) {
      logger.info('Running cleanup functions', {
        operation: 'cleanup_start',
        functionsCount: cleanupFunctions.length
      });

      for (let i = 0; i < cleanupFunctions.length; i++) {
        try {
          const cleanupFunction = cleanupFunctions[i];
          if (cleanupFunction) {
            const result = cleanupFunction();
            if (result instanceof Promise) {
              await result;
            }
          }
          logger.debug(`Cleanup function ${i + 1} completed`, {
            operation: 'cleanup_function_success',
            functionIndex: i + 1
          });
        } catch (error) {
          logger.error(`Cleanup function ${i + 1} failed`, {
            operation: 'cleanup_function_error',
            functionIndex: i + 1,
            recommendation: 'Check cleanup function implementation'
          }, error as Error);
        }
      }

      logger.info('Cleanup functions completed', {
        operation: 'cleanup_complete',
        functionsCount: cleanupFunctions.length
      });
    }
  }

  /**
   * Force shutdown (should only be used in emergency)
   */
  public forceShutdown(reason: string = 'FORCE_SHUTDOWN', exitCode: number = 1): void {
    logger.warn('Force shutdown initiated', {
      operation: 'force_shutdown',
      reason,
      exitCode,
      recommendation: 'Use graceful shutdown when possible'
    });
    process.exit(exitCode);
  }

  /**
   * Check if shutdown is in progress
   */
  public isShuttingDown(): boolean {
    return this.shutdownInProgress;
  }
}

/**
 * Convenience function to setup graceful shutdown with common patterns
 */
export function setupGracefulShutdown(
  server: Server,
  cleanupFunctions: (() => Promise<void> | void)[] = [],
  shutdownTimeout: number = 10000
): GracefulShutdown {
  const gracefulShutdown = GracefulShutdown.getInstance(shutdownTimeout);

  gracefulShutdown.register({
    server,
    cleanup: cleanupFunctions
  });

  gracefulShutdown.setupSignalHandlers();

  return gracefulShutdown;
}