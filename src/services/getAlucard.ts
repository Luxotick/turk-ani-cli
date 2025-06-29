/**
 * Alucard Stream Service
 * Handles fetching video streams from Alucard using Selenium
 */

import { Options, WebDriver, until, Builder, By, Capabilities } from 'selenium-webdriver';
import { Options as ChromeOptions } from 'selenium-webdriver/chrome.js';
import CDP from 'chrome-remote-interface';
import { download } from './download.js';
import { exec } from 'child_process';
import prompts from 'prompts';
import { Buffer } from 'buffer';
import path from 'path';
import { fileExists, sanitizeFilename } from '../utils/fileUtils.js';

// Configure Chrome options for headless operation
const options = new ChromeOptions();
options.addArguments('--headless=new')
options.addArguments('--no-sandbox');
options.addArguments('--disable-dev-shm-usage');
options.addArguments('--remote-debugging-port=9224');
options.addArguments('--window-size=1920x1080');
options.addArguments('--disable-blink-features=AutomationControlled');
options.addArguments('--disable-infobars');

const mozillaUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
options.addArguments(`user-agent=${mozillaUserAgent}`);

const capabilities = Capabilities.chrome();

/**
 * Kill any running Chrome processes
 */
async function killChromeProcesses() {
    return new Promise((resolve) => {
        exec('taskkill /F /IM chrome.exe /T && taskkill /F /IM chromedriver.exe /T', (error) => {
            if (error) {
                //console.log('No Chrome processes found or already terminated');
            } else {
                //console.log('Successfully killed Chrome processes');
            }
            resolve(null);
        });
    });
}

/**
 * Close Chrome debugger connection
 */
async function closeDebuggerConnection() {
    try {
        const client = await CDP({ port: 9224 });
        await client.close();
        //console.log('Closed Chrome debugging session');
    } catch (error) {
        // Ignore errors if the connection is already closed
    }
}

/**
 * Get Alucard stream URL and download the video
 * @param url Episode URL
 * @param selectedFansubParam Selected fansub parameter
 * @param selectedBolum Selected episode name
 * @param currentEpisodeIndex Current episode index
 * @param allEpisodes Array of all episodes
 * @param selectedFansubName Selected fansub name
 * @param isCacheMode Whether this is a background cache operation
 * @param startPosition Position in seconds to start playback from (optional)
 * @param animeId ID of the anime (for saving watch history, optional)
 * @param animeTitle Title of the anime (for saving watch history, optional)
 */
export async function getAlucard(
    url: string, 
    selectedFansubParam: string, 
    selectedBolum: string, 
    currentEpisodeIndex: number, 
    allEpisodes: { title: string; link: string }[], 
    selectedFansubName: string,
    isCacheMode: boolean = false,
    startPosition: number = 0,
    animeId?: string,
    animeTitle?: string
) {
    let driver: WebDriver | undefined;
    let retryCount = 0;
    const maxRetries = 3;

    // Custom log function that respects cache mode
    const log = (message: string) => {
        if (!isCacheMode) {
            console.log(message);
        }
    };

    // Check if stream data already exists before starting Chrome processes
    const __dirname = import.meta.dirname;
    const sanitizedEpisodeName = sanitizeFilename(selectedBolum);
    const downloadPath = path.resolve(__dirname, "downloads", sanitizedEpisodeName);
    const masterFilePath = path.join(downloadPath, "master.m3u8");
    
    if (fileExists(masterFilePath)) {
        log('Stream data already exists. Skipping Chrome processes...');
        return download(
            url, 
            selectedBolum, 
            currentEpisodeIndex, 
            allEpisodes, 
            selectedFansubName,
            isCacheMode,
            startPosition,
            animeId,
            animeTitle
        );
    }

    // TODO: Keep the old regex-based method as fallback
    async function tryGetAlucardStreamLegacy(): Promise<string | null> {
        await new Promise(resolve => setTimeout(resolve, 5000));
        if (!isCacheMode) log('Checking for Alucard stream URL with legacy method...');
        const pageSource = await driver!.getPageSource();
        
        // Try different regex patterns to find the URL
        const alucardMatch = pageSource.match(/https:\/\/alucard\.stream\/cdn\/playlist\/[^"']*/);
        if (alucardMatch) {
            return alucardMatch[0];
        }
        
        // Try alternative pattern
        const altMatch = pageSource.match(/https:\/\/[^"']*alucard[^"']*\.m3u8/i);
        if (altMatch) {
            return altMatch[0];
        }
        
        if (!isCacheMode) log('No Alucard stream URL found in page source');
        return null;
    }

    /**
     * Monitor network requests using Chrome DevTools Protocol (CDP)
     * to capture Alucard stream URLs in real-time
     */
    async function monitorNetworkRequests(): Promise<string | null> {
        return new Promise(async (resolve) => {
            try {
                const client = await CDP({ port: 9224 });
                const { Network } = client;
                
                await Network.enable();
                
                if (!isCacheMode) log('CDP Network monitoring started...');
                
                // Set up timeout
                const timeout = setTimeout(() => {
                    client.close();
                    resolve(null);
                }, 30000); // 30 seconds timeout
                
                Network.requestWillBeSent((params) => {
                    const url = params.request.url;
                    
                    // Log all requests for debugging (only in non-cache mode)
                    if (!isCacheMode) {
                        console.log('Network request detected:', url);
                    }
                    
                    // Check for Alucard stream URLs
                    if (url.includes('alucard.stream') && 
                        (url.includes('playlist') || url.endsWith('.m3u8'))) {
                        if (!isCacheMode) log('Found Alucard stream URL via CDP: ' + url);
                        clearTimeout(timeout);
                        client.close();
                        resolve(url);
                    }
                });
                
                Network.responseReceived((params) => {
                    const url = params.response.url;
                    
                    // Also check responses for stream URLs
                    if (url.includes('alucard.stream') && 
                        (url.includes('playlist') || url.endsWith('.m3u8'))) {
                        if (!isCacheMode) log('Found Alucard stream URL in response via CDP: ' + url);
                        clearTimeout(timeout);
                        client.close();
                        resolve(url);
                    }
                });
                
            } catch (error) {
                if (!isCacheMode) console.error('CDP monitoring error:', error);
                resolve(null);
            }
        });
    }

    try {
        driver = await new Builder()
            .forBrowser('chrome')
            .withCapabilities(capabilities)
            .setChromeOptions(options)
            .build();

        log('Navigating to URL: ' + url);
        
        await driver.get(url);

        // Start CDP network monitoring immediately after page load
        const cdpMonitoringPromise = monitorNetworkRequests();

        // Check if we're handling a next episode with a fansub name (not a parameter)
        if (selectedFansubName !== 'null' && selectedFansubParam === selectedFansubName) {
            if (!isCacheMode) log('Next episode detected with fansub name: ' + selectedFansubName);
            
            // Wait for the fansub buttons to load
            try {
                await driver.wait(until.elementLocated(By.css('.pull-right button')), 10000);
                
                // Find all fansub buttons
                const buttons = await driver.findElements(By.css('.pull-right button'));
                
                // Find the button with matching text
                let fansubParam = null;
                for (const button of buttons) {
                    const buttonText = await button.getText();
                    if (buttonText.trim() === selectedFansubName) {
                        const onclick = await button.getAttribute('onclick');
                        if (onclick) {
                            // Extract parameter from onclick attribute
                            const paramMatch = onclick.match(/'([^']+)'/);
                            if (paramMatch && paramMatch[1]) {
                                fansubParam = paramMatch[1];
                                break;
                            }
                        }
                    }
                }
                
                if (fansubParam) {
                    // Execute the script with the extracted parameter
                    const script = `IndexIcerik('${fansubParam}','videodetay');`;
                    if (!isCacheMode) log('Executing script with extracted parameter: ' + fansubParam);
                    await driver.executeScript(script);
                } else {
                    if (!isCacheMode) log(`Could not find button for fansub: ${selectedFansubName}`);
                }
            } catch (error) {
                if (!isCacheMode) console.error('Error finding fansub buttons:', error);
            }
        } 
        // If we have a direct parameter (first episode or successfully extracted parameter)
        else if (selectedFansubParam !== 'null') {
            const script = `IndexIcerik('${selectedFansubParam}','videodetay');`;
            if (!isCacheMode) log('Executing script with fansub parameter: ' + selectedFansubParam);
            await driver!.executeScript(script);
        }
        
        // Add a wait for page to load after script execution
        await driver.sleep(3000);
        
        // Try to find any iframe that might contain the video
        try {
            const iframes = await driver.findElements(By.tagName('iframe'));
            
            if (iframes.length > 0) {
                await driver.switchTo().frame(iframes[0]);
                await driver.sleep(1000);
                await driver.switchTo().defaultContent();
            }
        } catch (e) {
            if (!isCacheMode) log('Error checking iframes: ' + e);
        }

        // First try to get stream URL via CDP monitoring
        const cdpStreamUrl = await cdpMonitoringPromise;
        
        if (cdpStreamUrl) {
            if (!isCacheMode) log('Found Alucard stream URL via CDP: ' + cdpStreamUrl);
            await driver.close();
            await driver.quit();
            if (!isCacheMode) log('Chrome driver closed successfully');

            await download(cdpStreamUrl, selectedBolum, currentEpisodeIndex, allEpisodes, selectedFansubName, isCacheMode, startPosition, animeId, animeTitle);
            return;
        }

        // Fallback to legacy regex-based method if CDP didn't find anything
        if (!isCacheMode) log('CDP method failed, falling back to legacy regex method...');
        
        // Try legacy method with retries
        while (retryCount < maxRetries) {
            const streamUrl = await tryGetAlucardStreamLegacy();
            
            if (streamUrl) {
                if (!isCacheMode) log('Found Alucard stream URL via legacy method: ' + streamUrl);
                await driver.close();
                await driver.quit();
                if (!isCacheMode) log('Chrome driver closed successfully');

                await download(streamUrl, selectedBolum, currentEpisodeIndex, allEpisodes, selectedFansubName, isCacheMode, startPosition, animeId, animeTitle);
                break;
            } else {
                retryCount++;
                if (retryCount < maxRetries) {
                    if (!isCacheMode) log(`Retry ${retryCount}/${maxRetries}: Waiting for Alucard stream...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                } else {
                    if (!isCacheMode) log('Failed to find Alucard stream URL after all retries');
                }
            }
        }

    } catch (error) {
        if (!isCacheMode) console.error('Detailed Error:', error);
    } finally {
        if (driver) {
            try {
                await driver.close();
                await driver.quit();
                if (!isCacheMode) log('Chrome driver closed successfully');
            } catch (err) {
                if (!isCacheMode) console.error('Error closing browser:', err);
            }
        }
        
        await closeDebuggerConnection();
    }
} 