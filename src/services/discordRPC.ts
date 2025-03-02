/**
 * Discord Rich Presence integration
 * Provides Discord status updates about what anime/episode is being watched
 */

import { Client } from 'discord-rpc';
import { fetchBolumler } from './episode.js'; 

// Discord application client ID
const clientId = '1335425935578628208';
const rpc = new Client({ transport: 'ipc' });

// Default activity state
let activity = {
    details: 'Browsing Anime',
    state: 'Idle',
    largeImageKey: 'ads_z', 
    largeImageText: 'Turk Ani Cli',
    instance: false,
    buttons: [
        {
            label: 'GitHub Projesi',
            url: 'https://github.com/Luxotick/', 
        },
        {
            label: 'Turkanime',
            url: 'https://www.turkanime.co', 
        },
    ],
};

/**
 * Initialize Discord RPC connection
 */
export async function initializeRPC() {
    try {
        rpc.on('ready', () => {
            clearActivity();
            rpc.setActivity(activity).catch(() => {});
        });

        rpc.on('disconnected', () => {
            setTimeout(initializeRPC, 30000); // Try to reconnect after 30 seconds
        });

        await rpc.login({ clientId }).catch(() => {
            setTimeout(initializeRPC, 30000); // Try again after 30 seconds if login fails
        });
    } catch (_) {
        setTimeout(initializeRPC, 30000); // Try again after 30 seconds if any error occurs
    }
}

/**
 * Update the Discord activity status
 * @param newActivity Partial activity object to update
 */
export function updateActivity(newActivity: Partial<typeof activity>) {
    if (!rpc || !rpc.user) return; // Exit if no connection
    activity = { ...activity, ...newActivity };
    rpc.setActivity(activity).catch(() => {}); // Ignore errors
}

/**
 * Clear the Discord activity status
 */
export function clearActivity() {
    rpc.clearActivity().catch(console.error);
}

/**
 * Update Discord RPC with anime and episode details
 * @param animeId ID of the anime
 * @param selectedBolumIndex Index of the selected episode
 */
export async function updateRPCWithAnimeDetails(animeId: string, selectedBolumIndex: number) {
    if (!rpc || !rpc.user) return; // Exit if no connection

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

// Initialize RPC when this module is imported
initializeRPC(); 