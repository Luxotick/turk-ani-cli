// discordRPC.ts
import { Client } from 'discord-rpc';
import { fetchBolumler } from './episode.js'; 

const clientId = '1335425935578628208';
const rpc = new Client({ transport: 'ipc' });

let activity = {
    details: 'Browsing Anime',
    state: 'Idle',
    largeImageKey: 'ads_z', 
    largeImageText: 'Turk Ani Cli',
    instance: false,
    buttons: [
        {
            label: 'GitHub Projesi',
            url: 'https://github.com/Luxotick/', // GitHub proje URL'si
        },
        {
            label: 'Turkanime',
            url: 'https://www.turkanime.co', // Turkanime URL'si
        },
    ],
};

export async function initializeRPC() {
    try {
        rpc.on('ready', () => {
            clearActivity();
            rpc.setActivity(activity).catch(() => {});
        });

        rpc.on('disconnected', () => {
            setTimeout(initializeRPC, 30000); // 30 saniye sonra yeniden başlat
        });

        await rpc.login({ clientId }).catch(() => {
            setTimeout(initializeRPC, 30000); // 30 saniye sonra tekrar dene
        });
    } catch (_) {
        setTimeout(initializeRPC, 30000); // Genel hata olursa da 30 saniye sonra tekrar dene
    }
}



export function updateActivity(newActivity: Partial<typeof activity>) {
    if (!rpc || !rpc.user) return; // Bağlantı yoksa çık
    activity = { ...activity, ...newActivity };
    rpc.setActivity(activity).catch(() => {}); // Hata olursa yok say
}



export function clearActivity() {
    rpc.clearActivity().catch(console.error);
}

export async function updateRPCWithAnimeDetails(animeId: string, selectedBolumIndex: number) {
    if (!rpc || !rpc.user) return; // Bağlantı yoksa çık

    const bolumler = await fetchBolumler(animeId);
    if (bolumler && bolumler[selectedBolumIndex]?.title) {
        const title = bolumler[selectedBolumIndex].title;
        const titleWithoutNumber = title.replace(/\d+$/, '').trim();
        const matches = title.match(/\d+$/);
        const episodeNumber = matches ? matches[0] : 'Unknown';
        const episodeLink = bolumler[selectedBolumIndex].link;

        updateActivity({
            details: `Watching ${titleWithoutNumber}`,
            state: `Episode ${episodeNumber}`,
            buttons: [
                { label: 'GitHub Project 🛠️', url: 'https://github.com/Luxotick/turk-ani-cli' },
                { label: 'Watch Episode 🎬', url: `https://${episodeLink}` },
            ],
        });
    }
}


initializeRPC();