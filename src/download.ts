import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { Builder, WebDriver } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import path from 'path';
import fs from 'fs';
import startServer from './hostServer.js'; // Sunucu dosyasını içe aktar
import { exec } from 'child_process';

// Function to kill Chrome processes and cleanup debugging session
async function cleanupChrome() {
    // Kill any remaining Chrome processes
    exec('taskkill /F /IM chrome.exe /T', () => {});
    
    // Cleanup debugging port
    exec('netstat -ano | findstr :9224 | findstr LISTENING', (error, stdout) => {
        if (stdout) {
            const pid = stdout.split(/\s+/)[4];
            exec(`taskkill /F /PID ${pid}`);
        }
    });
}

export async function download(url: string, episodeName: string, currentEpisodeIndex?: number, allEpisodes?: { title: string; link: string }[], fansubName: string = 'null') {
  console.log('Starting download process for URL:', url);
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  };
  const __dirname = import.meta.dirname

  // Remove spaces and sanitize the episode name for safe file system usage
  const sanitizedEpisodeName = episodeName
    .replace(/ /g, '')
    .replace(/:/g, '') // Remove colons
    .replace(/[<>:"\/\\|?*]/g, '') // Remove Windows invalid characters
    .replace(/[^\x20-\x7E]/g, '') // Remove non-printable ASCII characters
    .replace(/^\.+/, '') // Remove leading periods (hidden files in Unix)
    .replace(/^(con|prn|aux|nul|com\d|lpt\d)$/i, '_$1') // Handle Windows reserved names
    .substring(0, 255); // Limit length to common filesystem max
  
  const downloadPath = path.resolve(__dirname, "downloads", sanitizedEpisodeName); // Folder for the specific episode
  const masterFilePath = path.join(downloadPath, "master.m3u8");

  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath, { recursive: true }); // Create the episode directory if it doesn't exist
    console.log(`Created download directory: ${downloadPath}`);
  } else {
    console.log(`Download directory already exists: ${downloadPath}`);
  }

  // Check if the master.m3u8 file already exists
  if (fs.existsSync(masterFilePath)) {
    console.log('Stream data already exists. Opening existing stream...');
    //await cleanupChrome(); // Clean up before starting server
    await startServer(sanitizedEpisodeName, currentEpisodeIndex || 0, allEpisodes || [], fansubName);
    return;
  }

  try {
    //console.log('Setting up Chrome options for download...');
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
    options.addArguments("--user-data-dir=/path/to/temporary/profile")  // Farklı bir profil kullan

    console.log('Creating Chrome driver...');
    const driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    try {
      console.log('Navigating to Alucard stream URL:', url);
      await driver.get(url);
      
      //console.log('Downloading alucard stream data..');
      console.log('GET Request successfully sent');
      
      const masterFilePathFromDownload = await waitForDownloadToFinish(downloadPath) as string;
      console.log('Download completed:', masterFilePathFromDownload);

      // Read the master.m3u8 file to extract links
      if (fs.existsSync(masterFilePathFromDownload)) {
        const masterContent = fs.readFileSync(masterFilePathFromDownload, 'utf8');
        const lines = masterContent.split('\n');

        //console.log('Processing m3u8 content...');
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

              //console.log(`Downloading ${localFileName}..`);

              // Download the linked file using Selenium
              await downloadFileWithSelenium(driver, line, localFilePath);
              newContent.push(`http://localhost:8000/downloads/${sanitizedEpisodeName}/${localFileName}`); // Change to the HTTP URL with the sanitized episode name
            } else {
              newContent.push(line);
            }
          }
        }

        fs.writeFileSync(masterFilePath, newContent.join('\n'));
        console.log(`master.m3u8 created at ${masterFilePath}`);
      } else {
        console.log('Error: master.m3u8 file not found after download');
      }

      //await cleanupChrome();
      await startServer(sanitizedEpisodeName, currentEpisodeIndex || 0, allEpisodes || [], fansubName);
    } finally {
      await driver.close();
      await driver.quit();
    }
  } catch (error) {
    console.error('Download error:', error);
    return null;
  }
}

async function waitForDownloadToFinish(downloadPath: string, timeout: number = 60000) {
  //console.log(`Waiting for download in ${downloadPath}...`);
  const startTime = Date.now();

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
                //console.log(`Renamed ${filePath} to ${correctFilePath}`);
                resolve(correctFilePath);
                return;
              }
            } catch (readError) {
              console.log(`Error reading file content for renaming: ${readError}`);
            }
            
            resolve(filePath);
            return;
          }
        }

        // Check for timeout
        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          console.log(`Download timeout after ${timeout}ms`);
          reject(new Error(`Download timeout after ${timeout}ms`));
        }
      } catch (error) {
        console.log('Error checking download directory:', error);
        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(error);
        }
      }
    }, 1000); // Check every 1 second
  });
}

async function downloadFileWithSelenium(driver: WebDriver, url: string, outputPath: string) {
  console.log(`Downloading ${url} to ${outputPath}`);
  await driver.get(url);

  // Wait for the download to complete
  await waitForDownloadToFinish(path.dirname(outputPath));
}