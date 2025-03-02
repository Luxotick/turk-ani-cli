/**
 * Logger Utility
 * Provides consistent logging throughout the application
 */

/**
 * Log an info message
 * @param message Message to log
 */
export function info(message: string): void {
  console.log(`[INFO] ${message}`);
}

/**
 * Log an error message
 * @param message Error message to log
 * @param error Optional error object
 */
export function error(message: string, error?: any): void {
  console.error(`[ERROR] ${message}`);
  if (error) {
    console.error(error);
  }
}

/**
 * Log a warning message
 * @param message Warning message to log
 */
export function warn(message: string): void {
  console.warn(`[WARNING] ${message}`);
}

/**
 * Log a debug message (only in development)
 * @param message Debug message to log
 */
export function debug(message: string): void {
  if (process.env.NODE_ENV === 'development') {
    console.debug(`[DEBUG] ${message}`);
  }
} 