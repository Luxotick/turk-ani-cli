/**
 * Update Utilities
 * Functions for checking and handling package updates
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Get the current installed version of the package
 * @returns The current version string
 */
export async function getCurrentVersion(): Promise<string> {
  try {
    // First try to get version from package.json
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      return packageJson.version;
    }
    
    // If package.json not found, try npm list
    const { stdout } = await execAsync('npm list -g turk-ani-cli --json');
    const npmList = JSON.parse(stdout);
    return npmList.dependencies['turk-ani-cli'].version;
  } catch (error) {
    console.error('Error getting current version:', error);
    return '0.0.0'; // Return a default version if we can't determine the current one
  }
}

/**
 * Get the latest version available on npm
 * @returns The latest version string
 */
export async function getLatestVersion(): Promise<string> {
  try {
    const response = await fetch('https://registry.npmjs.org/turk-ani-cli');
    const data = await response.json() as any;
    return data['dist-tags'].latest;
  } catch (error) {
    console.error('Error checking for updates:', error);
    return '0.0.0'; // Return a default version if we can't check
  }
}

/**
 * Compare version strings
 * @param v1 First version
 * @param v2 Second version
 * @returns -1 if v1 < v2, 0 if v1 == v2, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const v1Parts = v1.split('.').map(Number);
  const v2Parts = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;
    
    if (v1Part > v2Part) return 1;
    if (v1Part < v2Part) return -1;
  }
  
  return 0;
}

/**
 * Check if an update is available
 * @returns Object with update information
 */
export async function checkForUpdates(): Promise<{
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}> {
  const currentVersion = await getCurrentVersion();
  const latestVersion = await getLatestVersion();
  const updateAvailable = compareVersions(currentVersion, latestVersion) < 0;
  
  return {
    currentVersion,
    latestVersion,
    updateAvailable
  };
}

/**
 * Display update notification if an update is available
 */
export async function notifyIfUpdateAvailable(): Promise<void> {
  try {
    const { currentVersion, latestVersion, updateAvailable } = await checkForUpdates();
    
    if (updateAvailable) {
      console.log('\n┌────────────────────────────────────────────────┐');
      console.log(`│ Update available: ${currentVersion} → ${latestVersion}${' '.repeat(Math.max(0, 22 - currentVersion.length - latestVersion.length))}│`);
      console.log('│ Run: npm install -g turk-ani-cli to update      │');
      console.log('└────────────────────────────────────────────────┘\n');
    }
  } catch (error) {
    // Silently fail if update check fails - don't interrupt the user
    console.error('Error in update notification:', error);
  }
} 