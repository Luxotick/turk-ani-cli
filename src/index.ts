import { Command } from 'commander';
const program = new Command();
import fetch from 'node-fetch';
import cheerio from 'cheerio';
import prompts from 'prompts';
import { fetchBolumler } from './episode'; // episode.ts dosyasını içe aktar
import { getAlucard } from './getAlucard';
import { Buffer } from "buffer";

interface Result {
  title: string;
  animeId: string; // Added animeId to the Result interface
}

program
  .version('0.0.1')
  .description('Turk-Ani-CLI, Türkçe anime izlemek için geliştirilmiş bir CLI aracı')
  .option('-a, --anime <name>', 'Anime bul');

program.parse(process.argv);

const options = program.opts();
if (options.anime) {
  console.log(`Anime bilgisi getiriliyor: ${options.anime}`);
  search(options.anime).then((results) => {
    if (results === null) return console.log('Anime bulunamadı.');

    prompt(results as Result[]);
  });
}

async function search(query: string) {
  const fd = new URLSearchParams();
  fd.append('arama', query);

  const results: Result[] = [];
  const seenTitles = new Set<string>(); // Track seen titles

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
        seenTitles.add(title); // Mark this title as seen
      }
    });
    
    return results.length > 0 ? results : null;
  } catch (error) {
    console.log('[HATA] ', error);
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
      await promptBolumSec(bolumler); // Burada await ekledik
    }
  } catch (error) {
    console.log('[HATA] ', error);
  }
}

async function promptBolumSec(bolumler: { title: string; link: string }[]) {
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

    // Seçilen bölümün HTML içeriğini kontrol et
    const responseHtml = await fetch(`https:${selectedBolum.link}`);
    const htmlContent = await responseHtml.text();
    
    // 'pull-right' div'ini kontrol et
    const $ = cheerio.load(htmlContent);
    const hasPullRightDiv = $('.pull-right').length > 0;

    if (hasPullRightDiv) {
      // 'pull-right' div'i mevcutsa, butonları kullanıcıya sun
      const buttonChoices = $('.pull-right button').map((i, button) => {
        const buttonLabel = $(button).text().trim();
        return { title: buttonLabel, value: $(button).attr('onclick') }; // onclick içeriği değer olarak al
      }).get();

      const buttonResponse = await prompts({
        type: 'select',
        name: 'selectedButton',
        message: 'Bir video seçin:',
        choices: buttonChoices,
      });

      const selectedButton = buttonResponse.selectedButton;

      if (buttonChoices.length === 1){
        console.log(`Seçilen video parametresi: ${buttonChoices}`);
        await getAlucard(`http:${selectedBolum.link}`, `null`, `${selectedBolum.title}`);
      }else{
        const videoSelectionParam = selectedButton.split("'")[1]; // onclick içeriğinden parametreyi al
        const encode = (str: string):string => Buffer.from(str, 'binary').toString('base64');
        console.log(`Seçilen video parametresi: ${encode(videoSelectionParam)}`);
        await getAlucard(`http:${selectedBolum.link}`, `${videoSelectionParam}`, `${selectedBolum.title}`);
      }
    } else {
      console.log("Seçilen bölüm için geçerli video seçenekleri bulunamadı.");
      await getAlucard(`https:${selectedBolum.link}`, "null", `${selectedBolum.title}`)
    }
  } catch (error) {
    console.log('[HATA] ', error);
  }
}



