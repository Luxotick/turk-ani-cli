import { Options, WebDriver, until, Builder, By, Capabilities } from 'selenium-webdriver';
import { Options as ChromeOptions } from 'selenium-webdriver/chrome.js';
import CDP from 'chrome-remote-interface';
import { download } from './download.js';
import { exec } from 'child_process';
import prompts from 'prompts';
import { Buffer } from 'buffer';

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

async function closeDebuggerConnection() {
    try {
        const client = await CDP({ port: 9224 });
        await client.close();
        //console.log('Closed Chrome debugging session');
    } catch (error) {
        // Ignore errors if the connection is already closed
    }
}

export async function getAlucard(url: string, selectedFansubParam: string, selectedBolum: string, currentEpisodeIndex: number, allEpisodes: { title: string; link: string }[], selectedFansubName: string) {
    let driver: WebDriver | undefined;
    let retryCount = 0;
    const maxRetries = 3;

    async function tryGetAlucardStream(): Promise<string | null> {
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log('Checking for Alucard stream URL...');
        const pageSource = await driver!.getPageSource();
        
        // Log a portion of the page source to debug
        //console.log('Page source snippet:', pageSource.substring(0, 500) + '...');
        
        // Try different regex patterns to find the URL
        const alucardMatch = pageSource.match(/https:\/\/alucard\.stream\/cdn\/playlist\/[^"']*/);
        if (alucardMatch) {
            //console.log('Found Alucard URL with pattern 1:', alucardMatch[0]);
            return alucardMatch[0];
        }
        
        // Try alternative pattern
        const altMatch = pageSource.match(/https:\/\/[^"']*alucard[^"']*\.m3u8/i);
        if (altMatch) {
            //console.log('Found Alucard URL with pattern 2:', altMatch[0]);
            return altMatch[0];
        }
        
        console.log('No Alucard stream URL found in page source');
        return null;
    }

    try {
        //await killChromeProcesses();

        driver = await new Builder()
            .forBrowser('chrome')
            .withCapabilities(capabilities)
            .setChromeOptions(options)
            .build();

        //console.log('Chrome instance created successfully');
        console.log('Navigating to URL:', url);
        
        await driver.get(url);

        // Check if we're handling a next episode with a fansub name (not a parameter)
        if (selectedFansubName !== 'null' && selectedFansubParam === selectedFansubName) {
            console.log('Next episode detected with fansub name:', selectedFansubName);
            
            // Wait for the fansub buttons to load
            try {
                //console.log('Waiting for fansub buttons to appear...');
                await driver.wait(until.elementLocated(By.css('.pull-right button')), 10000);
                
                // Find all fansub buttons
                const buttons = await driver.findElements(By.css('.pull-right button'));
                //console.log(`Found ${buttons.length} fansub buttons`);
                
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
                                //console.log(`Found matching fansub button with parameter: ${fansubParam}`);
                                break;
                            }
                        }
                    }
                }
                
                if (fansubParam) {
                    // Execute the script with the extracted parameter
                    const script = `IndexIcerik('${fansubParam}','videodetay');`;
                    console.log('Executing script with extracted parameter:', fansubParam);
                    await driver.executeScript(script);
                } else {
                    console.log(`Could not find button for fansub: ${selectedFansubName}`);
                }
            } catch (error) {
                console.error('Error finding fansub buttons:', error);
            }
        } 
        // If we have a direct parameter (first episode or successfully extracted parameter)
        else if (selectedFansubParam !== 'null') {
            const script = `IndexIcerik('${selectedFansubParam}','videodetay');`;
            console.log('Executing script with fansub parameter:', selectedFansubParam);
            await driver!.executeScript(script);
        }
        
        // Add a wait for page to load after script execution
        //console.log('Waiting for page to update after script execution...');
        await driver.sleep(3000);
        
        // Try to find any iframe that might contain the video
        try {
            const iframes = await driver.findElements(By.tagName('iframe'));
            //console.log(`Found ${iframes.length} iframes on the page`);
            
            if (iframes.length > 0) {
                //console.log('Switching to first iframe to check for video content');
                await driver.switchTo().frame(iframes[0]);
                await driver.sleep(1000);
                await driver.switchTo().defaultContent();
            }
        } catch (e) {
            console.log('Error checking iframes:', e);
        }

        // Try to get Alucard stream with retries
        while (retryCount < maxRetries) {
            const streamUrl = await tryGetAlucardStream();
            
            if (streamUrl) {
                console.log('Found Alucard stream URL:', streamUrl);
                await download(streamUrl, selectedBolum, currentEpisodeIndex, allEpisodes, selectedFansubName);
                break;
            } else {
                retryCount++;
                if (retryCount < maxRetries) {
                    console.log(`Retry ${retryCount}/${maxRetries}: Waiting for Alucard stream...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                } else {
                    console.log('Failed to find Alucard stream URL after all retries');
                }
            }
        }

    } catch (error) {
        console.error('Detailed Error:', error);
    } finally {
        if (driver) {
            try {
                await driver.quit();
                await driver.close();
                console.log('Chrome driver closed successfully');
            } catch (err) {
                console.error('Error closing browser:', err);
            }
        }
        
        await closeDebuggerConnection();
        //await killChromeProcesses();
    }
}