/**
 * File Utilities
 * Helper functions for file operations
 */

import fs from 'fs';
import path from 'path';

/**
 * Sanitize a filename to be safe for file systems
 * @param filename Filename to sanitize
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/ /g, '')
    .replace(/:/g, '') // Remove colons
    .replace(/[<>:"\/\\|?*]/g, '') // Remove Windows invalid characters
    .replace(/[^\x20-\x7E]/g, '') // Remove non-printable ASCII characters
    .replace(/^\.+/, '') // Remove leading periods (hidden files in Unix)
    .replace(/^(con|prn|aux|nul|com\d|lpt\d)$/i, '_$1') // Handle Windows reserved names
    .substring(0, 255); // Limit length to common filesystem max
}

/**
 * Ensure a directory exists, creating it if necessary
 * @param dirPath Directory path to ensure
 * @returns True if directory exists or was created
 */
export function ensureDirectoryExists(dirPath: string): boolean {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      return true;
    }
    return true;
  } catch (error) {
    console.error(`Error creating directory ${dirPath}:`, error);
    return false;
  }
}

/**
 * Check if a file exists
 * @param filePath Path to the file
 * @returns True if file exists
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Read a file as text
 * @param filePath Path to the file
 * @returns File contents as string or null if error
 */
export function readFileAsText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null;
  }
}

/**
 * Write text to a file
 * @param filePath Path to the file
 * @param content Content to write
 * @returns True if successful
 */
export function writeTextToFile(filePath: string, content: string): boolean {
  try {
    fs.writeFileSync(filePath, content);
    return true;
  } catch (error) {
    console.error(`Error writing to file ${filePath}:`, error);
    return false;
  }
} 