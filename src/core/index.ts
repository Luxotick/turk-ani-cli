#!/usr/bin/env node

import { Command } from 'commander';
const program = new Command();
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import prompts from 'prompts';
import { fetchBolumler } from '../services/episode.js';
import { getAlucard } from '../services/getAlucard.js';
import { Buffer } from "buffer";
import { updateRPCWithAnimeDetails } from '../services/discordRPC.js';
import { notifyIfUpdateAvailable, getCurrentVersion, getLatestVersion, compareVersions, checkForUpdates } from '../utils/updateUtils.js';
import { getLastWatchedAnime, getWatchHistory, WatchHistoryEntry, saveWatchHistory } from '../utils/historyUtils.js';
import path from 'path';
import fs from 'fs';
import startServer from '../services/hostServer.js';
import { sanitizeFilename } from '../utils/fileUtils.js';

interface Result {
  title: string;
  animeId: string;
}

/**
 * Main entry point for the application
 * Processes command line arguments and initiates anime search
 */

// Set up CLI commands
program
  .name('turk-ani-cli')
  .description('A command-line interface for watching Turkish anime')
  .version('2.0.0-beta.7'); // This will be replaced by the actual version from package.json at build time

// Add version command
program
  .command('version')
  .description('Check current version and if updates are available')
  .action(async () => {
    try {
      const currentVersion = await getCurrentVersion();
      const latestVersion = await getLatestVersion();
      const updateAvailable = compareVersions(currentVersion, latestVersion) < 0;
      
      console.log(`Current version: ${currentVersion}`);
      console.log(`Latest version: ${latestVersion}`);
      
      if (updateAvailable) {
        console.log('\nAn update is available! Run the following command to update:');
        console.log('npm install -g turk-ani-cli');
      } else {
        console.log('\nYou are using the latest version.');
      }
    } catch (error) {
      console.error('Error checking version:', error);
    }
    process.exit(0);
  });

// Add default command for anime search
program
  .argument('[animeName...]', 'Name of the anime to search for')
  .description('Search for and watch anime')
  .action(async (animeNameArgs) => {
    const animeName = animeNameArgs.join(' ').replace(/^"(.*)"$/, '$1'); // Remove quotes if present
    
    // If no anime name provided, show watch history option
    if (!animeName) {
      const lastWatched = getLastWatchedAnime();
      const recentHistory = getWatchHistory(5);
      
      if (lastWatched || recentHistory.length > 0) {
        // Create choice options from history
        const choices = [];
        
        if (recentHistory.length > 0) {
          // Add history items
          choices.push({
            title: '📋 Watch History',
            value: 'history',
            description: 'View your recently watched anime'
          });
          
          // Add delete history option
          choices.push({
            title: '🗑️ Delete Watch History',
            value: 'delete-history',
            description: 'Delete all your watch history'
          });
          
          // Add separator
          choices.push({
            title: '─────────────────────────────────────',
            disabled: true
          });
        }
        
        // Add search option
        choices.push({
          title: '🔍 Search for anime',
          value: 'search',
          description: 'Search for a new anime to watch'
        });
        
        // Prompt user to select an option
        const response = await prompts({
          type: 'select',
          name: 'action',
          message: 'Select an option:',
          choices: choices
        });
        
        if (response.action === 'history') {
          await promptWatchHistory();
          return;
        } else if (response.action === 'delete-history') {
          await promptDeleteHistory();
          return;
        } else if (response.action === 'search') {
          // Prompt for search
          const searchResponse = await prompts({
            type: 'text',
            name: 'query',
            message: 'Enter anime name to search:'
          });
          
          if (searchResponse.query) {
            // Continue with anime search
            console.log(`Anime bilgisi getiriliyor: ${searchResponse.query}`);
            const results = await search(searchResponse.query);
            if (results === null) return console.log('Anime bulunamadı.');
            prompt(results as Result[]);
          }
          return;
        }
      } else {
        // No history, prompt for search
        const searchResponse = await prompts({
          type: 'text',
          name: 'query',
          message: 'Enter anime name to search:'
        });
        
        if (searchResponse.query) {
          // Continue with anime search
          console.log(`Anime bilgisi getiriliyor: ${searchResponse.query}`);
          const results = await search(searchResponse.query);
          if (results === null) return console.log('Anime bulunamadı.');
          prompt(results as Result[]);
        }
        return;
      }
    }
    
    // Check for updates synchronously before showing search results
    try {
      const { currentVersion, latestVersion, updateAvailable } = await checkForUpdates();
      
      if (updateAvailable) {
        console.log('\n┌────────────────────────────────────────────────┐');
        console.log(`│ Update available: ${currentVersion} → ${latestVersion}${' '.repeat(Math.max(0, 22 - currentVersion.length - latestVersion.length))}│`);
        console.log('│ Run: npm install -g turk-ani-cli to update      │');
        console.log('└────────────────────────────────────────────────┘\n');
      }
    } catch (error) {
      // Silently fail if update check fails
    }
    
    // Continue with anime search after update check
    console.log(`Anime bilgisi getiriliyor: ${animeName}`);
    const results = await search(animeName);
    if (results === null) return console.log('Anime bulunamadı.');
    prompt(results as Result[]);
  });

// Parse arguments
program.parse(process.argv);

/**
 * Search for anime by name
 * @param query The anime name to search for
 * @returns Array of search results or null if none found
 */
async function search(query: string): Promise<Result[] | null> {
  const fd = new URLSearchParams();
  fd.append('arama', query);

  const results: Result[] = [];
  const seenTitles = new Set<string>();

  try {
    const response = await fetch("https://www.turkanime.co/arama", {
      method: 'POST',
      body: fd,
    });
    const text = await response.text();
    const $ = cheerio.load(text);

    $('#orta-icerik .panel-body').each((index, element) => {
      const titleElement = $(element).find('.media-heading a');
      const title = titleElement.text().trim();
      const animeId = $(element).find('.btn-def.reactions').data('unique-id') as string;

      if (title && animeId && !seenTitles.has(title)) {
        results.push({ title, animeId });
        seenTitles.add(title);
      }
    });

    if (results.length === 0) {
      const scriptText = $('#orta-icerik script').html();
      if (scriptText) {
        const parts = scriptText.split('=');
        if (parts.length > 1) {
          const animePath = parts[1].trim().replace(/['";]/g, '');
          if (animePath) {
            const animeUrl = `https://www.turkanime.co/${animePath}`;
            console.log(`Alternatif URL: ${animeUrl}`);

            const animeResponse = await fetch(animeUrl);
            const animeHtml = await animeResponse.text();
            const $$ = cheerio.load(animeHtml);

            const activeLink = $$('div.panel-menu #aktif-sekme li.active a');
            if (activeLink.length) {
              const dataUrl = activeLink.attr('data-url') || '';
              const animeIdMatch = dataUrl.match(/animeId=(\d+)/);
              if (animeIdMatch && animeIdMatch[1]) {
                const animeId = animeIdMatch[1];
                const titleParts = animePath.split('/');
                const title = titleParts[titleParts.length - 1] || 'Unknown Anime';

                results.push({ title, animeId });
                return results;
              } else {
                console.log('[Uyarı] Panel-menu üzerinden anime ID bulunamadı.');
                return null;
              }
            } else {
              console.log('[Uyarı] Panel-menu bulunamadı.');
              return null;
            }
          }
        }
      }
      return null;
    }

    return results;
  } catch (error) {
    console.log('[HATA] ', error);
    return null;
  }
}

/**
 * Prompt user to select an anime from search results
 * @param results Array of anime search results
 */
async function prompt(results: Result[]) {
  const choices = results.map((result) => ({
      title: result.title,
      value: result.animeId,
  }));

  try {
      const response: { selectedAnimeId: string } = await prompts({
          type: 'select',
          name: 'selectedAnimeId',
          message: 'Bir anime seçin:',
          choices: choices,
      });

      console.log(`Seçilen anime ID: ${response.selectedAnimeId}`);
      
      const bolumler = await fetchBolumler(response.selectedAnimeId);
      if (bolumler) {
          await promptBolumSec(bolumler, response.selectedAnimeId);
      }
  } catch (error) {
      console.log('[HATA] ', error);
  }
}

/**
 * Prompt user to select an anime from watch history
 */
async function promptWatchHistory() {
  const history = getWatchHistory();
  
  if (history.length === 0) {
    console.log('No watch history found');
    return;
  }
  
  const choices = history.map((entry) => ({
    title: `${entry.title} - ${entry.episodeTitle}`,
    description: `Last watched: ${new Date(entry.timestamp).toLocaleString()}${entry.position ? ` - Position: ${formatTime(entry.position)}` : ''}`,
    value: entry
  }));
  
  // Add back option
  choices.push({
    title: '← Back',
    description: 'Return to main menu',
    value: 'back' as any // Use 'as any' to avoid type error
  });
  
  try {
    const response = await prompts({
      type: 'select',
      name: 'selectedEntry',
      message: 'Select anime to continue watching:',
      choices: choices
    });
    
    if (response.selectedEntry === 'back') {
      // Go back to main menu
      const animeNameArgs: string[] = [];
      program.parseAsync([process.argv[0], process.argv[1], ...animeNameArgs]);
      return;
    }
    
    if (response.selectedEntry) {
      const entry: WatchHistoryEntry = response.selectedEntry;
      
      console.log(`Continuing: ${entry.title} - ${entry.episodeTitle}`);
      console.log(`Last watched position: ${formatTime(entry.position || 0)}`);
      
      // Fetch episode list to have all episodes available
      const bolumler = await fetchBolumler(entry.animeId);
      if (!bolumler) {
        console.log('Failed to fetch episodes');
        return;
      }
      
      // Get the episode path from saved history
      const __dirname = import.meta.dirname;
      const sanitizedEpisodeName = sanitizeFilename(entry.episodeTitle);
      const downloadPath = path.resolve(__dirname, '../services/downloads', sanitizedEpisodeName);
      const masterFilePath = path.join(downloadPath, "master.m3u8");
      
      // Check if the file exists
      if (fs.existsSync(masterFilePath)) {
        console.log(`Found existing stream data for: ${entry.episodeTitle}`);
        console.log(`Resuming playback from position: ${formatTime(entry.position || 0)}`);
        
        // Start the server and playback directly with the saved position
        await startServer(
          sanitizedEpisodeName,
          entry.episodeIndex,
          bolumler,
          entry.fansubName || 'null',
          entry.position || 0,  // Start from the saved position
          entry.animeId,
          entry.title
        );
        
        return;
      }
      
      // If file doesn't exist, need to re-download
      console.log("Stream data not found. Need to re-fetch the episode.");
      
      // Get the episode from the bolumler array
      if (entry.episodeIndex >= 0 && entry.episodeIndex < bolumler.length) {
        const selectedBolum = bolumler[entry.episodeIndex];
        console.log(`Re-fetching episode: ${selectedBolum.title}`);
        
        // Use getAlucard to fetch and play the episode with correct number of arguments
        await getAlucard(
          `https:${selectedBolum.link}`, 
          entry.fansubName || 'null', 
          selectedBolum.title, 
          entry.episodeIndex, 
          bolumler, 
          entry.fansubName || 'null',
          false  // Not cache mode
        );
        
        // After getAlucard returns, the episode will have been downloaded
        // Now we can start the server directly with the position
        const sanitizedEpisodeName = sanitizeFilename(selectedBolum.title);
        await startServer(
          sanitizedEpisodeName,
          entry.episodeIndex,
          bolumler,
          entry.fansubName || 'null',
          entry.position || 0,
          entry.animeId,
          entry.title
        );
      } else {
        // If the episode index is out of bounds, show the episode selection menu
        console.log("Episode index out of range, showing episode selection menu");
        await promptBolumSec(bolumler, entry.animeId, entry.episodeIndex);
      }
    }
  } catch (error) {
    console.log('[HATA] ', error);
  }
}

/**
 * Format seconds into HH:MM:SS
 */
function formatTime(seconds: number): string {
  if (!seconds) return '00:00:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0')
  ].join(':');
}

/**
 * Prompt user to select an episode
 * @param bolumler Array of episodes
 * @param animeId ID of the selected anime
 * @param defaultIndex Default index to select (optional)
 */
async function promptBolumSec(bolumler: { title: string; link: string }[], animeId: string, defaultIndex?: number) {
  const choices = bolumler.map((bolum, index) => ({
    title: bolum.title,
    value: index,
    selected: defaultIndex !== undefined && index === defaultIndex
  }));

  try {
    const response: { selectedBolumIndex: number } = await prompts({
      type: 'select',
      name: 'selectedBolumIndex',
      message: 'Bir bölüm seçin:',
      choices: choices,
      initial: defaultIndex !== undefined ? defaultIndex : 0
    });

    const selectedBolum = bolumler[response.selectedBolumIndex];
    console.log(`Seçilen bölüm: ${selectedBolum.title}`);
    console.log(`Bölüm Linki: https:${selectedBolum.link}`);

    const responseHtml = await fetch(`https:${selectedBolum.link}`);
    const htmlContent = await responseHtml.text();
    
    const $ = cheerio.load(htmlContent);
    const hasPullRightDiv = $('.pull-right').length > 0;

    if (hasPullRightDiv) {
      const buttonChoices = $('.pull-right button').map((i, button) => {
        const buttonLabel = $(button).text().trim();
        const onclick = $(button).attr('onclick');
        return { title: buttonLabel, value: onclick || '' };
      }).get();

      const buttonResponse = await prompts({
        type: 'select',
        name: 'selectedButton',
        message: 'Bir video seçin:',
        choices: buttonChoices,
      });

      const selectedButton = buttonResponse.selectedButton;

      if (buttonChoices.length === 1) {
        const buttonText = buttonChoices[0].title;
        const videoSelectionParam = buttonChoices[0].value?.split("'")[1] || 'null';
        console.log(`Seçilen video parametresi: ${buttonChoices}`);
        
        // Save to watch history before playing
        const animeTitle = await getAnimeTitle(animeId);
        saveWatchHistory({
          animeId,
          title: animeTitle || 'Unknown Anime',
          episodeIndex: response.selectedBolumIndex,
          episodeTitle: selectedBolum.title,
          timestamp: Date.now(),
          fansubName: buttonText,
          position: 0 // Start at the beginning
        });
        
        await getAlucard(
          `http:${selectedBolum.link}`, 
          videoSelectionParam, 
          `${selectedBolum.title}`, 
          response.selectedBolumIndex, 
          bolumler, 
          buttonText,
          false, // Not cache mode
          0,     // Start at beginning
          animeId,
          animeTitle || 'Unknown Anime'
        );
      } else {
        const selectedChoice = buttonChoices.find(c => c.value === selectedButton);
        const buttonText = selectedChoice?.title || 'null';
        const videoSelectionParam = selectedButton.split("'")[1];
        const encode = (str: string):string => Buffer.from(str, 'binary').toString('base64');
        console.log(`Seçilen video parametresi: ${encode(videoSelectionParam)}`);
        
        // Save to watch history before playing
        const animeTitle = await getAnimeTitle(animeId);
        saveWatchHistory({
          animeId,
          title: animeTitle || 'Unknown Anime',
          episodeIndex: response.selectedBolumIndex,
          episodeTitle: selectedBolum.title,
          timestamp: Date.now(),
          fansubName: buttonText,
          position: 0 // Start at the beginning
        });
        
        await getAlucard(
          `http:${selectedBolum.link}`, 
          videoSelectionParam, 
          `${selectedBolum.title}`, 
          response.selectedBolumIndex, 
          bolumler, 
          buttonText,
          false, // Not cache mode
          0,     // Start at beginning
          animeId,
          animeTitle || 'Unknown Anime'
        );
      }
    } else {
      console.log("Seçilen bölüm için geçerli video seçenekleri bulunamadı.");
      
      // Save to watch history before playing
      const animeTitle = await getAnimeTitle(animeId);
      saveWatchHistory({
        animeId,
        title: animeTitle || 'Unknown Anime',
        episodeIndex: response.selectedBolumIndex,
        episodeTitle: selectedBolum.title,
        timestamp: Date.now(),
        fansubName: "null",
        position: 0 // Start at the beginning
      });
      
      await getAlucard(
        `https:${selectedBolum.link}`, 
        "null", 
        `${selectedBolum.title}`, 
        response.selectedBolumIndex, 
        bolumler, 
        "null",
        false, // Not cache mode
        0,     // Start at beginning
        animeId,
        animeTitle || 'Unknown Anime'
      );
    }

    await updateRPCWithAnimeDetails(animeId, response.selectedBolumIndex);
  } catch (error) {
    console.log('[HATA] ', error);
  }
}

/**
 * Get anime title by ID
 * @param animeId Anime ID
 * @returns Anime title or null if not found
 */
async function getAnimeTitle(animeId: string): Promise<string | null> {
  try {
    const response = await fetch(`https://www.turkanime.co/anime/${animeId}`);
    if (!response.ok) {
      return null;
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Try to get title from page
    const title = $('h1.text-center').text().trim();
    return title || null;
  } catch (error) {
    console.error('Error fetching anime title:', error);
    return null;
  }
}

/**
 * Prompt user to confirm and delete watch history
 */
async function promptDeleteHistory() {
  try {
    const confirmation = await prompts({
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to delete all watch history?',
      initial: false
    });
    
    if (confirmation.confirm) {
      const { deleteWatchHistory } = await import('../utils/historyUtils.js');
      const success = deleteWatchHistory();
      
      if (success) {
        console.log('Watch history has been deleted successfully.');
      } else {
        console.log('Failed to delete watch history.');
      }
    } else {
      console.log('Operation canceled.');
    }
    
    // Return to main menu
    const animeNameArgs: string[] = [];
    program.parseAsync([process.argv[0], process.argv[1], ...animeNameArgs]);
  } catch (error) {
    console.log('[HATA] ', error);
  }
} 