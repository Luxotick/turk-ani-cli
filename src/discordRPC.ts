// discordRPC.ts
import { Client } from 'discord-rpc';
import { fetchBolumler } from './episode.ts'; 

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
    rpc.on('ready', () => {
        console.log('Discord RPC is ready!');
        clearActivity();
        rpc.setActivity(activity);
    });

    rpc.on('disconnected', () => {
        console.log('Discord RPC disconnected.');
    });

    await rpc.login({ clientId }).catch(console.error);
}

export function updateActivity(newActivity: Partial<typeof activity>) {
    activity = { ...activity, ...newActivity };
    rpc.setActivity(activity);
}

export function clearActivity() {
    rpc.clearActivity().catch(console.error);
}

export async function updateRPCWithAnimeDetails(animeId: string, selectedBolumIndex: number) {
    const bolumler = await fetchBolumler(animeId);
    if (bolumler && bolumler[selectedBolumIndex].title) {
        const title = bolumler[selectedBolumIndex].title;
        const titleWithoutNumber = title.replace(/\d+$/, '').trim();
        const episodeNumber = title.match(/\d+$/) ? title.match(/\d+$/)[0] : 'Unknown';
        const episodeLink = bolumler[selectedBolumIndex].link;  // Use the link from the fetched bolumler

        updateActivity({
            details: `Watching ${titleWithoutNumber}`,
            state: `Episode ${episodeNumber}`,
            buttons: [
                {
                    label: 'GitHub Project 🛠️',
                    url: 'https://github.com/Luxotick/turk-ani-cli',
                },
                {
                    label: 'Watch Episode 🎬',  
                    url: `https://${episodeLink}`, 
                },
            ],
        });
    }
}

initializeRPC();