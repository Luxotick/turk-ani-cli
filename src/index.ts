#!/usr/bin/env node

import { Command } from 'commander';
const program = new Command();
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import prompts from 'prompts';
import { fetchBolumler } from './episode.js'; // episode.ts dosyasını içe aktar
import { getAlucard } from './getAlucard.js';
import { Buffer } from "buffer";
import { updateRPCWithAnimeDetails } from './discordRPC.js';

interface Result {
  title: string;
  animeId: string; // Added animeId to the Result interface
}

const args = process.argv.slice(2);
const animeName = args.join(' ').replace(/^"(.*)"$/, '$1'); // Remove quotes if present

if (animeName) {
  console.log(`Anime bilgisi getiriliyor: ${animeName}`);
  search(animeName).then((results) => {
    if (results === null) return console.log('Anime bulunamadı.');
    prompt(results as Result[]);
  });
}

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