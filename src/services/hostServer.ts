/**
 * Host Server Service
 * Manages a local HTTP server to serve video content and handle MPV player
 */

import express from 'express';
import path from 'path';
import { exec, spawn } from 'child_process';
import { getAlucard } from './getAlucard.js';
import fs from 'fs';
import readline from 'readline';
import { cacheNextEpisode } from '../utils/cacheUtils.js';
import { saveWatchHistory } from '../utils/historyUtils.js';
import os from 'os';
import { ensureDirectoryExists, sanitizeFilename } from '../utils/fileUtils.js';
import * as net from 'net';

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
 * @param startPosition Position in seconds to start playback from (optional)
 * @param animeId ID of the anime (for saving watch history, optional)
 * @param animeTitle Title of the anime (for saving watch history, optional)
 * @returns Promise that resolves when playback ends
 */
const startServer = (
    episodeName: string, 
    currentEpisodeIndex: number, 
    allEpisodes: { title: string; link: string }[], 
    selectedFansub: string,
    startPosition: number = 0,
    animeId?: string,
    animeTitle?: string
) => {
    return new Promise((resolve) => {
        if (server) {
            runMpv(episodeName, currentEpisodeIndex, allEpisodes, selectedFansub, startPosition, animeId, animeTitle).then(resolve);
            return;
        }

        server = app.listen(PORT, () => {
            console.log(`Server is running at http://localhost:${PORT}`);
            runMpv(episodeName, currentEpisodeIndex, allEpisodes, selectedFansub, startPosition, animeId, animeTitle).then(resolve);
        }).on('error', (err) => {
            if ((err as any).code === 'EADDRINUSE') {
                console.log('Server already running, continuing with MPV...');
                runMpv(episodeName, currentEpisodeIndex, allEpisodes, selectedFansub, startPosition, animeId, animeTitle).then(resolve);
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
 * @param startPosition Position in seconds to start playback from (optional)
 * @param animeId ID of the anime (for saving watch history)
 * @param animeTitle Title of the anime (for saving watch history)
 * @returns Promise that resolves when playback ends
 */
function runMpv(
    episodeName: string, 
    currentEpisodeIndex: number, 
    allEpisodes: { title: string; link: string }[], 
    selectedFansub: string,
    startPosition: number = 0,
    animeId?: string,
    animeTitle?: string
): Promise<void> {
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
        
        // Set up IPC socket for MPV
        const socketPath = path.join(os.tmpdir(), `mpv-socket-${Date.now()}`);
        let currentPosition = startPosition;
        
        // Build the MPV command with the start position if provided
        let mpvArgs = [
            '--display-tags-clr',
            '--user-agent=Mozilla/5.0',
            '--fullscreen',
            '--volume=50',
            '--cache=yes',
            '--cache-pause=no',
            '--cache-secs=120',
            '--demuxer-readahead-secs=120',
            '--force-seekable=yes',
            '--stream-lavf-o=stimeout=60000000',
            '--network-timeout=60',
            '--hls-bitrate=max',
            '--stream-buffer-size=128M',
            '--vd-lavc-threads=8',
            '--no-ytdl',
            '--demuxer-max-bytes=512MiB',
            '--demuxer-max-back-bytes=128MiB',
            '--fullscreen',
            `--input-conf=${inputConfPath}`,
            // Enable IPC socket
            `--input-ipc-server=${socketPath}`
        ];

        // Add start position if provided
        if (startPosition > 0) {
            mpvArgs.push(`--start=${startPosition}`);
            console.log(`Starting playback from position: ${formatTime(startPosition)}`);
        }

        // Add the video URL
        const videoUrl = `http://localhost:${PORT}/downloads/${episodeName}/master.m3u8`;
        mpvArgs.push(videoUrl);

        console.log('Starting MPV...');

        // Start caching the next episode in the background
        if (allEpisodes && currentEpisodeIndex < allEpisodes.length - 1) {
            cacheNextEpisode(allEpisodes, currentEpisodeIndex, selectedFansub);
        }

        // Use spawn instead of exec for better control
        const mpvProcess = spawn('mpv', mpvArgs, { 
            stdio: ['inherit', 'pipe', 'pipe']
        });
        
        // Create a Unix domain socket client to communicate with MPV
        let connected = false;
        let retryCount = 0;
        const maxRetries = 10;
        
        const connectToSocket = () => {
            if (connected || retryCount >= maxRetries) return;
            
            const socket = net.createConnection(socketPath);
            let buffer = '';
            
            socket.on('connect', () => {
                connected = true;
                console.log('Connected to MPV socket');
                
                // Get current position every second
                const positionInterval = setInterval(() => {
                    socket.write('{"command": ["get_property", "time-pos"]}\n');
                }, 1000);
                
                socket.on('data', (data: Buffer) => {
                    buffer += data.toString();
                    
                    // Process complete JSON objects
                    let newlineIndex;
                    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                        const line = buffer.slice(0, newlineIndex);
                        buffer = buffer.slice(newlineIndex + 1);
                        
                        try {
                            const response = JSON.parse(line);
                            if (response.error === 'success' && response.data !== null && typeof response.data === 'number') {
                                currentPosition = response.data;
                            }
                        } catch (e) {
                            // Ignore parse errors
                        }
                    }
                });
                
                socket.on('end', () => {
                    clearInterval(positionInterval);
                    connected = false;
                });
                
                socket.on('error', (err: Error) => {
                    clearInterval(positionInterval);
                    connected = false;
                    console.error(`Socket error: ${err.message}`);
                });
            });
            
            socket.on('error', (err: Error) => {
                // Socket connection failed, retry after a delay
                retryCount++;
                if (retryCount < maxRetries) {
                    setTimeout(connectToSocket, 500);
                }
            });
        };
        
        // Wait a bit before trying to connect to the socket
        setTimeout(connectToSocket, 1000);

        // Handle process exit
        mpvProcess.on('exit', async (code) => {
            console.log(`Playback ended at position: ${formatTime(currentPosition)}`);
            
            // Save current position to watch history if we have anime ID
            if (animeId && animeTitle) {
                console.log(`Saving playback position: ${formatTime(currentPosition)}`);
                saveWatchHistory({
                    animeId,
                    title: animeTitle,
                    episodeIndex: currentEpisodeIndex,
                    episodeTitle: episodeName,
                    timestamp: Date.now(),
                    fansubName: selectedFansub,
                    position: Math.floor(currentPosition)
                });
            }
            
            // Clean up socket file
            try {
                if (fs.existsSync(socketPath)) {
                    fs.unlinkSync(socketPath);
                }
            } catch (e) {
                // Ignore errors deleting socket file
            }
            
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

export default startServer; 