import { Options, WebDriver, until, Builder, By, Capabilities } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';
import CDP from 'chrome-remote-interface';
import { download } from './download';

interface Response {
    url: string;
}

interface ResponseReceivedParams {
    response: Response;
}

const options = new chrome.Options();
options.addArguments('--headless=new')
options.addArguments('--no-sandbox');
options.addArguments('--disable-dev-shm-usage');
options.addArguments('--remote-debugging-port=9224'); // Remote debugging port
options.addArguments('--window-size=1920x1080');
options.addArguments('--disable-blink-features=AutomationControlled');
options.addArguments('--disable-infobars');

const mozillaUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
options.addArguments(`user-agent=${mozillaUserAgent}`);

//options.addArguments("--use-fake-ui-for-media-stream")
const capabilities = Capabilities.chrome();


const driver = await new Builder()
    .forBrowser('chrome')
    .withCapabilities(capabilities)
    .setChromeOptions(options)
    .build();

export async function getAlucard(url: string, selectedFansub: string, selectedBolum: string) {
    let responseReceived = false; // Flag to track if the desired response has been received
    const client = await CDP({ port: 9224 });
    const { Network } = client;

    try {
        await Network.enable();

        Network.responseReceived(({ response }: ResponseReceivedParams) => {
           // console.log('Response URL:', response.url);
            if (!responseReceived && response.url.includes('https://alucard.stream/cdn/playlist/')) {
                //console.log('Bulunan URL:', response.url);
                console.log('Found Alucard player fetching stream..')
                responseReceived = true;
                download(response.url, selectedBolum); // Pass the episode title
            }
        });

        await driver.get(url);

        const specificElementSelector = '.btn-group.pull-right';
        await driver.wait(until.elementLocated(By.css(specificElementSelector)), 10000);

        const ajax = 'https://www.turkanime.co/' + selectedFansub;
        const script = 
            `IndexIcerik('${ajax}','videodetay');`
        ;

        await driver.executeScript(script);

        await console.log('User-Agent set to: Luxotick1337 - AgalarCrack')

        const timeout = setTimeout(() => {
            if (!responseReceived) {
                console.warn('Timeout: Closing driver.');
                responseReceived = true; // Mark to avoid calling quit again
                client.close();
                driver.close();
                driver.quit();
            }
        }, 10000); // Adjust timeout duration as needed

        // Wait for the response to be received or timeout
        await new Promise((resolve) => {
            const checkResponseInterval = setInterval(() => {
                if (responseReceived) {
                    clearInterval(checkResponseInterval);
                    clearTimeout(timeout);
                    resolve(null);
                }
            }, 500);
        });
    } catch (error) {
        console.error('Hata:', error);
    } finally {
        await client.close(); // Close the CDP client
        await driver.close();
        await driver.quit(); // Ensure driver quits on completion or error
    }
}