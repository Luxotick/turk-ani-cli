/**
 * Episode service
 * Handles fetching episode information from the anime website
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

/**
 * Fetch episodes for a specific anime
 * @param animeId ID of the anime to fetch episodes for
 * @returns Array of episodes with title and link, or null if none found
 */
export async function fetchBolumler(animeId: string): Promise<{ title: string; link: string }[] | null> {
    const url = `https://www.turkanime.co/ajax/bolumler?animeId=${animeId}`;
    
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest'
    };

    const bolumler: { title: string; link: string }[] = [];

    try {
        const response = await fetch(url, { headers });

        if (!response.ok) {
            throw new Error(`HTTP Hatası: ${response.status}`);
        }

        const data = await response.text();
        
        const $ = cheerio.load(data);
        
        const bolumElemanlari = $('#bolumler #bolum-list .menum li');

        bolumElemanlari.each((index, element) => {
            const title = $(element).find('.bolumAdi').text().trim();
            const link = $(element).find('a').eq(1).attr('href'); // Get the second <a> tag's href
            
            if (title && link) {
                bolumler.push({ title, link }); // Push an object with title and link
            }
        });

        return bolumler.length > 0 ? bolumler : null;
    } catch (error) {
        console.error('Hata:', error);
        return null;
    }
} 