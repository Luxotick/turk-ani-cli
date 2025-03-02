/**
 * Host Server Service
 * Manages a local HTTP server to serve video content and handle MPV player
 */

import express from 'express';
import path from 'path';
import { exec } from 'child_process';
import { getAlucard } from './getAlucard.js';
import fs from 'fs';
import readline from 'readline';
import { cacheNextEpisode } from '../utils/cacheUtils.js';

const app = express();
const PORT = 8000;

const __dirname = import.meta.dirname
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

let server: any = null;

/**
 * Start the HTTP server and launch MPV player
 * @param episodeName Name of the episode
 * @param currentEpisodeIndex Index of the current episode
 * @param allEpisodes Array of all episodes
 * @param selectedFansub Selected fansub name
 * @returns Promise that resolves when playback ends
 */
const startServer = (episodeName: string, currentEpisodeIndex: number, allEpisodes: { title: string; link: string }[], selectedFansub: string) => {
    return new Promise((resolve) => {
        if (server) {
            runMpv(episodeName, currentEpisodeIndex, allEpisodes, selectedFansub).then(resolve);
            return;
        }

        server = app.listen(PORT, () => {
            console.log(`Server is running at http://localhost:${PORT}`);
            runMpv(episodeName, currentEpisodeIndex, allEpisodes, selectedFansub).then(resolve);
        }).on('error', (err) => {
            if ((err as any).code === 'EADDRINUSE') {
                console.log('Server already running, continuing with MPV...');
                runMpv(episodeName, currentEpisodeIndex, allEpisodes, selectedFansub).then(resolve);
            } else {
                console.error('Server error:', err);
                process.exit(1);
            }
        });

        // Cleanup on process exit
        process.on('SIGINT', () => {
            if (server) {
                server.close(() => {
                    console.log('Server closed');
                    process.exit(0);
                });
            }
        });
    });
}

/**
 * Run MPV player with the specified episode
 * @param episodeName Name of the episode
 * @param currentEpisodeIndex Index of the current episode
 * @param allEpisodes Array of all episodes
 * @param selectedFansub Selected fansub name
 * @returns Promise that resolves when playback ends
 */
function runMpv(episodeName: string, currentEpisodeIndex: number, allEpisodes: { title: string; link: string }[], selectedFansub: string): Promise<void> {
    return new Promise((resolve) => {
        // Show available controls first
        console.log('\nAvailable controls:');
        console.log('Space - Play/Pause');
        console.log('Arrow Right - Forward 5 seconds');
        console.log('Arrow Left - Backward 5 seconds');
        console.log('Arrow Up - Forward 60 seconds');
        console.log('Arrow Down - Backward 60 seconds');
        console.log('N - Next episode');
        console.log('Q - Quit\n');

        // Create mpv-input.conf file
        const inputConfPath = path.join(__dirname, 'mpv-input.conf');
        const inputConfContent = `
n quit 51
RIGHT seek 5
LEFT seek -5
UP seek 60
DOWN seek -60
SPACE cycle pause
q quit 0
        `.trim();

        fs.writeFileSync(inputConfPath, inputConfContent);
        
        const command = `mpv --display-tags-clr --user-agent="Mozilla/5.0" --fullscreen --volume=50 \
            --cache=yes \
            --cache-pause=no \
            --cache-secs=120 \
            --demuxer-readahead-secs=120 \
            --force-seekable=yes \
            --stream-lavf-o="stimeout=60000000" \
            --network-timeout=60 \
            --hls-bitrate=max \
            --stream-buffer-size=128M \
            --vd-lavc-threads=8 \
            --no-ytdl \
            --demuxer-max-bytes=512MiB \
            --demuxer-max-back-bytes=128MiB \
            --fullscreen \
            --input-conf="${inputConfPath}" \
            "http://localhost:${PORT}/downloads/${episodeName}/master.m3u8"`;

        console.log('Starting MPV...');

        // Start caching the next episode in the background
        if (allEpisodes && currentEpisodeIndex < allEpisodes.length - 1) {
            cacheNextEpisode(allEpisodes, currentEpisodeIndex, selectedFansub);
        }

        const mpvProcess = exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (error && error.code !== 51) { // Ignore exit code 51 (next episode)
                console.error('MPV Error:', error);
                resolve();
                return;
            }
        });

        mpvProcess.on('exit', async (code) => {
            if (code === 51) { // Next episode requested
                const nextEpisodeIndex = currentEpisodeIndex + 1;
                if (nextEpisodeIndex < allEpisodes.length) {
                    const nextEpisode = allEpisodes[nextEpisodeIndex];
                    console.log(`\nPlaying next episode: ${nextEpisode.title}`);
                    
                    // For next episode, pass the fansub name as both parameter and name
                    // The getAlucard function will handle finding the correct parameter
                    await getAlucard(
                        `https:${nextEpisode.link}`,
                        selectedFansub, // Pass fansub name as parameter to trigger special handling
                        nextEpisode.title,
                        nextEpisodeIndex,
                        allEpisodes,
                        selectedFansub  // Pass fansub name again
                    );
                }
            } else if (code === 0) { // Normal quit
                console.log('Playback ended.');
                if (server) {
                    server.close();
                }
                process.exit(0);
            }
            resolve();
        });

        // Only show next episode info if available
        if (Array.isArray(allEpisodes) && allEpisodes.length > 0 && currentEpisodeIndex + 1 < allEpisodes.length) {
            const nextEpisode = allEpisodes[currentEpisodeIndex + 1];
            console.log(`Next episode available: ${nextEpisode.title}`);
            console.log('Press N for next episode\n');
        }
    });
}

export default startServer; 