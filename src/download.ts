import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { Builder, WebDriver } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import path from 'path';
import fs from 'fs';
import startServer from './hostServer.js'; // Sunucu dosyasını içe aktar

export async function download(url: string, episodeName: string) {
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
  }

  // Check if the master.m3u8 file already exists
  if (fs.existsSync(masterFilePath)) {
    console.log('Stream data already exists. Opening existing stream...');
    startServer(sanitizedEpisodeName);
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

    const driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    try {
      await driver.get(url);
      const masterFilePathFromDownload = await waitForDownloadToFinish(downloadPath) as string;

      // Read the master.m3u8 file to extract links
      const masterContent = fs.readFileSync(masterFilePathFromDownload, 'utf8');
      const lines = masterContent.split('\n');

      console.log('Downloading alucard stream data..')
      console.log('GET Request succesfully sent')

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

            console.log(`Downloading ${localFileName}..`);

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
    } finally {
      await driver.close();
      await driver.quit();
      startServer(`${sanitizedEpisodeName}`)
    }
  } catch (error) {
    console.error('Hata:', error);
    return null;
  }
}

async function waitForDownloadToFinish(downloadPath: string, timeout: number = 60000) {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      const files = fs.readdirSync(downloadPath).filter(f => f.startsWith("master") && f.endsWith(".m3u8"));

      if (files.length > 0) {
        const newestFile = files
          .map(file => ({
            file,
            time: fs.statSync(path.join(downloadPath, file)).mtimeMs
          }))
          .sort((a, b) => b.time - a.time)[0].file;

        const filePath = path.join(downloadPath, newestFile);

        if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
          clearInterval(checkInterval);

          const content = fs.readFileSync(filePath, "utf8");
          const resolutionMatch = content.match(/\/(\d+)\//); 

          if (resolutionMatch) {
            const resolution = resolutionMatch[1];
            const correctFilePath = path.join(downloadPath, `${resolution}.m3u8`);

            fs.renameSync(filePath, correctFilePath);
            console.log(`Renamed ${filePath} to ${correctFilePath}`);
            resolve(correctFilePath);
            return;
          }

          resolve(filePath);
        }
      }

      if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        reject(new Error('Download did not finish within the timeout period.'));
      }
    }, 1000);
  });
}

async function downloadFileWithSelenium(driver: WebDriver, url: string, outputPath: string) {
  console.log(`Downloading ${url} to ${outputPath}`);
  await driver.get(url);

  // Wait for the download to complete
  await waitForDownloadToFinish(path.dirname(outputPath));
}