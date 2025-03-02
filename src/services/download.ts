/**
 * Download Service
 * Handles downloading and processing video streams
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { Builder, WebDriver } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import path from 'path';
import fs from 'fs';
import startServer from './hostServer.js';
import { exec } from 'child_process';
import { sanitizeFilename, ensureDirectoryExists, fileExists, writeTextToFile } from '../utils/fileUtils.js';

/**
 * Clean up Chrome processes and debugging sessions
 */
async function cleanupChrome() {
    // Cleanup debugging port
    exec('netstat -ano | findstr :9224 | findstr LISTENING', (error, stdout) => {
        if (stdout) {
            const pid = stdout.split(/\s+/)[4];
            exec(`taskkill /F /PID ${pid}`);
        }
    });
}

/**
 * Download and process video stream
 * @param url Stream URL
 * @param episodeName Episode name
 * @param currentEpisodeIndex Current episode index
 * @param allEpisodes Array of all episodes
 * @param fansubName Fansub name
 * @param isCacheMode Whether this is a background cache operation
 * @returns null if download fails
 */
export async function download(
    url: string, 
    episodeName: string, 
    currentEpisodeIndex?: number, 
    allEpisodes?: { title: string; link: string }[], 
    fansubName: string = 'null',
    isCacheMode: boolean = false
) {
  // Custom log function that respects cache mode
  const log = (message: string) => {
    if (!isCacheMode) {
      console.log(message);
    }
  };

  log('Starting download process for URL: ' + url);
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  };
  const __dirname = import.meta.dirname

  // Sanitize the episode name for safe file system usage
  const sanitizedEpisodeName = sanitizeFilename(episodeName);
  
  const downloadPath = path.resolve(__dirname, "downloads", sanitizedEpisodeName); // Folder for the specific episode
  const masterFilePath = path.join(downloadPath, "master.m3u8");

  // Ensure download directory exists
  if (ensureDirectoryExists(downloadPath)) {
    log(`Download directory ready: ${downloadPath}`);
  } else {
    if (!isCacheMode) console.error('Failed to create download directory');
    return null;
  }

  // Check if the master.m3u8 file already exists
  if (fileExists(masterFilePath)) {
    log('Stream data already exists. Opening existing stream...');
    
    // Only start the server if not in cache mode
    if (!isCacheMode) {
      await startServer(sanitizedEpisodeName, currentEpisodeIndex || 0, allEpisodes || [], fansubName);
    }
    return;
  }

  try {
    const options = new chrome.Options();
    options.setUserPreferences({
      'download.default_directory': downloadPath,
      'download.prompt_for_download': false,
      'safebrowsing.enabled': true,
    });
    options.addArguments('--headless');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--window-size=1920x1080');
    options.addArguments('log-level=3')

    log('Creating Chrome driver...');
    const driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    try {
      log('Navigating to Alucard stream URL: ' + url);
      await driver.get(url);
      
      log('GET Request successfully sent');
      
      const masterFilePathFromDownload = await waitForDownloadToFinish(downloadPath, 60000, isCacheMode) as string;
      log('Download completed: ' + masterFilePathFromDownload);

      // Read the master.m3u8 file to extract links
      if (fileExists(masterFilePathFromDownload)) {
        const masterContent = fs.readFileSync(masterFilePathFromDownload, 'utf8');
        const lines = masterContent.split('\n');

        const newContent: string[] = [];

        for (const line of lines) {
          if (line.startsWith('#EXT-X-STREAM-INF')) {
            newContent.push(line);
            continue;
          }
          if (line.trim()) {
            const resolutionMatch = line.match(/\/(\d+)\//);
            if (resolutionMatch) {
              const resolution = resolutionMatch[1];
              const localFileName = `${resolution}.m3u8`;
              const localFilePath = path.join(downloadPath, localFileName);

              // Download the linked file using Selenium
              await downloadFileWithSelenium(driver, line, localFilePath, isCacheMode);
              newContent.push(`http://localhost:8000/downloads/${sanitizedEpisodeName}/${localFileName}`); // Change to the HTTP URL with the sanitized episode name
            } else {
              newContent.push(line);
            }
          }
        }

        // Write the modified content to master.m3u8
        if (writeTextToFile(masterFilePath, newContent.join('\n'))) {
          log(`master.m3u8 created at ${masterFilePath}`);
        } else {
          if (!isCacheMode) console.error('Failed to write master.m3u8 file');
        }
      } else {
        if (!isCacheMode) console.log('Error: master.m3u8 file not found after download');
      }

      await cleanupChrome();
      await driver.close();
      await driver.quit();
      
      // Only start the server if not in cache mode
      if (!isCacheMode) {
        await startServer(sanitizedEpisodeName, currentEpisodeIndex || 0, allEpisodes || [], fansubName);
      }
    } finally {
      // Cleanup handled in the finally block
    }
  } catch (error) {
    if (!isCacheMode) console.error('Download error:', error);
    return null;
  }
}

/**
 * Wait for a file to finish downloading
 * @param downloadPath Directory to watch for downloads
 * @param timeout Timeout in milliseconds
 * @param isCacheMode Whether this is a background cache operation
 * @returns Path to the downloaded file
 */
async function waitForDownloadToFinish(downloadPath: string, timeout: number = 60000, isCacheMode: boolean = false) {
  const startTime = Date.now();
  const log = (message: string) => {
    if (!isCacheMode) {
      console.log(message);
    }
  };

  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      try {
        // Check for master.m3u8 files specifically
        const files = fs.readdirSync(downloadPath).filter(f => f.startsWith("master") && f.endsWith(".m3u8"));
        
        if (files.length > 0) {
          // Get the newest file
          const newestFile = files
            .map(file => ({
              file,
              time: fs.statSync(path.join(downloadPath, file)).mtimeMs
            }))
            .sort((a, b) => b.time - a.time)[0].file;

          const filePath = path.join(downloadPath, newestFile);
          
          if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
            clearInterval(checkInterval);
            
            // Restore the original renaming logic
            try {
              const content = fs.readFileSync(filePath, "utf8");
              const resolutionMatch = content.match(/\/(\d+)\//); 

              if (resolutionMatch) {
                const resolution = resolutionMatch[1];
                const correctFilePath = path.join(downloadPath, `${resolution}.m3u8`);

                fs.renameSync(filePath, correctFilePath);
                resolve(correctFilePath);
                return;
              }
            } catch (readError) {
              log(`Error reading file content for renaming: ${readError}`);
            }
            
            resolve(filePath);
            return;
          }
        }

        // Check for timeout
        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          log(`Download timeout after ${timeout}ms`);
          reject(new Error(`Download timeout after ${timeout}ms`));
        }
      } catch (error) {
        log('Error checking download directory: ' + error);
        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(error);
        }
      }
    }, 1000); // Check every 1 second
  });
}

/**
 * Download a file using Selenium
 * @param driver Selenium WebDriver instance
 * @param url URL to download
 * @param outputPath Path to save the file
 * @param isCacheMode Whether this is a background cache operation
 */
async function downloadFileWithSelenium(driver: WebDriver, url: string, outputPath: string, isCacheMode: boolean = false) {
  if (!isCacheMode) {
    console.log(`Downloading ${url} to ${outputPath}`);
  }
  await driver.get(url);

  // Wait for the download to complete
  await waitForDownloadToFinish(path.dirname(outputPath), 60000, isCacheMode);
} 