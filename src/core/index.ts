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
    
    if (animeName) {
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
    }
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
 * Prompt user to select an episode
 * @param bolumler Array of episodes
 * @param animeId ID of the selected anime
 */
async function promptBolumSec(bolumler: { title: string; link: string }[], animeId: string) {
  const choices = bolumler.map((bolum, index) => ({
    title: bolum.title,
    value: index,
  }));

  try {
    const response: { selectedBolumIndex: number } = await prompts({
      type: 'select',
      name: 'selectedBolumIndex',
      message: 'Bir bölüm seçin:',
      choices: choices,
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
        await getAlucard(`http:${selectedBolum.link}`, videoSelectionParam, `${selectedBolum.title}`, response.selectedBolumIndex, bolumler, buttonText);
      } else {
        const selectedChoice = buttonChoices.find(c => c.value === selectedButton);
        const buttonText = selectedChoice?.title || 'null';
        const videoSelectionParam = selectedButton.split("'")[1];
        const encode = (str: string):string => Buffer.from(str, 'binary').toString('base64');
        console.log(`Seçilen video parametresi: ${encode(videoSelectionParam)}`);
        await getAlucard(`http:${selectedBolum.link}`, videoSelectionParam, `${selectedBolum.title}`, response.selectedBolumIndex, bolumler, buttonText);
      }
    } else {
      console.log("Seçilen bölüm için geçerli video seçenekleri bulunamadı.");
      await getAlucard(`https:${selectedBolum.link}`, "null", `${selectedBolum.title}`, response.selectedBolumIndex, bolumler, "null");
    }

    await updateRPCWithAnimeDetails(animeId, response.selectedBolumIndex);
  } catch (error) {
    console.log('[HATA] ', error);
  }
} 