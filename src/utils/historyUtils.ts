/**
 * History Utilities
 * Handles saving and retrieving watch history
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { ensureDirectoryExists, readFileAsText, writeTextToFile } from './fileUtils.js';

// Define watch history interface
export interface WatchHistoryEntry {
  animeId: string;
  title: string;
  episodeIndex: number;
  episodeTitle: string;
  timestamp: number;
  fansubName: string;
  position: number; // Position in seconds where playback was stopped
}

/**
 * Get the path to the watch history file
 * @returns Path to the watch history file
 */
function getHistoryFilePath(): string {
  const configDir = path.join(os.homedir(), '.tacli');
  ensureDirectoryExists(configDir);
  const historyPath = path.join(configDir, 'watch-history.json');
  
  // Migrate existing history entries if needed
  migrateWatchHistory(historyPath);
  
  return historyPath;
}

/**
 * Migrate existing watch history entries to include the position field
 * @param historyPath Path to the watch history file
 */
function migrateWatchHistory(historyPath: string): void {
  try {
    // Check if history file exists
    if (!fs.existsSync(historyPath)) {
      return;
    }
    
    // Read history file
    const historyText = readFileAsText(historyPath);
    if (!historyText) {
      return;
    }
    
    // Parse history
    let history: any[] = [];
    try {
      history = JSON.parse(historyText);
      
      // If not an array, no need to migrate
      if (!Array.isArray(history)) {
        return;
      }
    } catch (e) {
      // Invalid JSON, nothing to migrate
      return;
    }
    
    // Check if any entry needs migration
    let needsMigration = false;
    for (const entry of history) {
      if (typeof entry.position === 'undefined') {
        needsMigration = true;
        break;
      }
    }
    
    // If no migration needed, return
    if (!needsMigration) {
      return;
    }
    
    // Migrate entries
    const migratedHistory = history.map(entry => {
      if (typeof entry.position === 'undefined') {
        return { ...entry, position: 0 };
      }
      return entry;
    });
    
    // Save migrated history
    writeTextToFile(historyPath, JSON.stringify(migratedHistory, null, 2));
    console.log('Watch history migrated to include position field');
  } catch (error) {
    // Ignore errors during migration
    console.error('Error migrating watch history:', error);
  }
}

/**
 * Save a watch history entry
 * @param entry Watch history entry to save
 * @returns True if successful
 */
export function saveWatchHistory(entry: WatchHistoryEntry): boolean {
  try {
    const historyPath = getHistoryFilePath();
    let history: WatchHistoryEntry[] = [];
    
    // Create directory if it doesn't exist
    const configDir = path.dirname(historyPath);
    if (!fs.existsSync(configDir)) {
      ensureDirectoryExists(configDir);
    }
    
    // Read existing history if file exists
    if (fs.existsSync(historyPath)) {
      const existingHistory = readFileAsText(historyPath);
      if (existingHistory) {
        try {
          history = JSON.parse(existingHistory);
          
          // If not an array, initialize as empty array
          if (!Array.isArray(history)) {
            history = [];
          }
        } catch (e) {
          // Invalid JSON, start with empty array
          history = [];
        }
      }
    }
    
    // Find and remove any existing entry for this anime
    history = history.filter(item => item.animeId !== entry.animeId);
    
    // Add new entry to the beginning of the array
    history.unshift(entry);
    
    // Limit history to last 20 entries
    if (history.length > 20) {
      history = history.slice(0, 20);
    }
    
    // Save updated history
    return writeTextToFile(historyPath, JSON.stringify(history, null, 2));
  } catch (error) {
    console.error('Error saving watch history:', error);
    return false;
  }
}

/**
 * Get the last watched anime entry
 * @returns Last watch history entry or null if not found
 */
export function getLastWatchedAnime(): WatchHistoryEntry | null {
  try {
    const historyPath = getHistoryFilePath();
    
    // Check if history file exists
    if (!fs.existsSync(historyPath)) {
      return null;
    }
    
    // Create directory if it doesn't exist
    const configDir = path.dirname(historyPath);
    if (!fs.existsSync(configDir)) {
      ensureDirectoryExists(configDir);
      return null;
    }
    
    // Read history file
    const historyText = readFileAsText(historyPath);
    if (!historyText) {
      return null;
    }
    
    // Parse history
    const history = JSON.parse(historyText);
    
    // Check if history is valid and has entries
    if (!Array.isArray(history) || history.length === 0) {
      return null;
    }
    
    // Return the first (most recent) entry and ensure position exists
    const entry = history[0];
    if (entry && typeof entry.position === 'undefined') {
      entry.position = 0; // Add default position if missing
    }
    
    return entry;
  } catch (error) {
    console.error('Error getting last watched anime:', error);
    return null;
  }
}

/**
 * Get the watch history list
 * @param limit Maximum number of entries to return (default: 10)
 * @returns Array of watch history entries
 */
export function getWatchHistory(limit: number = 10): WatchHistoryEntry[] {
  try {
    const historyPath = getHistoryFilePath();
    
    // Check if history file exists
    if (!fs.existsSync(historyPath)) {
      return [];
    }
    
    // Create directory if it doesn't exist
    const configDir = path.dirname(historyPath);
    if (!fs.existsSync(configDir)) {
      ensureDirectoryExists(configDir);
      return [];
    }
    
    // Read history file
    const historyText = readFileAsText(historyPath);
    if (!historyText) {
      return [];
    }
    
    // Parse history
    const history = JSON.parse(historyText);
    
    // Check if history is valid
    if (!Array.isArray(history)) {
      return [];
    }
    
    // Ensure all entries have a position field
    const updatedHistory = history.map(entry => {
      if (typeof entry.position === 'undefined') {
        return { ...entry, position: 0 };
      }
      return entry;
    });
    
    // Return limited number of entries
    return updatedHistory.slice(0, limit);
  } catch (error) {
    console.error('Error getting watch history:', error);
    return [];
  }
}

/**
 * Delete all watch history
 * @returns True if successful
 */
export function deleteWatchHistory(): boolean {
  try {
    const historyPath = getHistoryFilePath();
    
    // Check if history file exists
    if (!fs.existsSync(historyPath)) {
      return true; // No history to delete
    }
    
    // Delete the history file
    fs.unlinkSync(historyPath);
    console.log('Watch history deleted successfully');
    return true;
  } catch (error) {
    console.error('Error deleting watch history:', error);
    return false;
  }
} 