// discordRPC.ts
import { Client } from 'discord-rpc';
import { fetchBolumler } from './episode.ts'; // Import necessary functions from your existing files

const clientId = '1335425935578628208'; // Replace with your Discord Application ID
const rpc = new Client({ transport: 'ipc' });

let activity = {
    details: 'Browsing Anime',
    state: 'Idle',
    largeImageKey: 'ads_z', // Replace with your image key
    largeImageText: 'Turk Ani Cli',
    instance: false,
    buttons: [
        {
            label: 'GitHub Projesi', // Buton metni
            url: 'https://github.com/Luxotick/', // GitHub proje URL'si
        },
        {
            label: 'Turkanime', // Buton metni
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

// Example usage in your existing code
export async function updateRPCWithAnimeDetails(animeId: string) {
    const bolumler = await fetchBolumler(animeId);
    if (bolumler && bolumler[0].title) {
        const title = bolumler[0].title;
        const titleWithoutNumber = title.replace(/\d+$/, '').trim();
        const episodeNumber = title.match(/\d+$/) ? title.match(/\d+$/)[0] : 'Unknown';
        const episodeLink = bolumler[0].link;  // Use the link from the fetched bolumler

        updateActivity({
            details: `Watching ${titleWithoutNumber}`,
            state: `Episode ${episodeNumber}`,
            buttons: [
                {
                    label: 'GitHub Project 🛠️',  // Update button label for project
                    url: 'https://github.com/Luxotick/turk-ani-cli',
                },
                {
                    label: 'Watch Episode 🎬',  // Update button label for episode
                    url: `https://${episodeLink}`,  // Use the specific anime episode URL
                },
            ],
        });
    }
}


// Call initializeRPC at the start of your application
initializeRPC();