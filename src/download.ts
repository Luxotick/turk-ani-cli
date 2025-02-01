import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { Options, WebDriver } from 'selenium-webdriver';
const { By, Builder, until } = require('selenium-webdriver');
import chrome from 'selenium-webdriver/chrome';
import path from 'path';
import fs from 'fs';
import startServer from './hostServer'; // Sunucu dosyasını içe aktar

export async function download(url: string, episodeName: string) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  };

  // Remove spaces from the episode name
  const sanitizedEpisodeName = episodeName.replace(/ /g, ''); 
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

      // Create an array to hold the new content for master.m3u8
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
            await downloadFileWithSelenium(driver, line, localFilePath);
            newContent.push(`http://localhost:8000/downloads/${sanitizedEpisodeName}/${localFileName}`); // Change to the HTTP URL with the sanitized episode name
          } else {
            newContent.push(line);
          }
        }
      }

      // Write the new content to the master.m3u8 file
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
      const files = fs.readdirSync(downloadPath);

      if (files.length > 0) {
        const filePath = path.join(downloadPath, files[0]);

        if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
          clearInterval(checkInterval);
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
  await driver.get(url);

  // Wait for the download to complete
  await waitForDownloadToFinish(path.dirname(outputPath));
}