import express from 'express';
import path from 'path';
import { exec } from 'child_process';
import { isExportAssignment } from 'typescript';

const app = express();
const PORT = 8000;

const __dirname = import.meta.dirname
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

const startServer = (episodeName: string) => {
    const server = app.listen(PORT, () => {
        console.log(`Server is running at http://localhost:${PORT}`);
        runMpv(episodeName);
    }).on('error', (err) => {
        if ((err as any).code === 'EADDRINUSE') {
            console.error(`Port ${PORT} is already in use. Please close other instances or change the port.`);
        } else {
            console.error('Server error:', err);
        }
        process.exit(1);
    });

    // Cleanup on process exit
    process.on('SIGINT', () => {
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });
}

function runMpv(episodeName: string) {
    const command = `mpv --display-tags-clr --user-agent="Mozilla/5.0" --fullscreen --volume=50 \
        --cache=yes \
        --cache-pause=no \
        --cache-secs=60 \
        --demuxer-readahead-secs=60 \
        --force-seekable=yes \
        --stream-lavf-o="stimeout=60000000" \
        --network-timeout=60 \
        --hls-bitrate=max \
        --stream-buffer-size=64M \
        --no-cache-pause \
        --vd-lavc-threads=8 \
        "http://localhost:8000/downloads/${episodeName}/master.m3u8"`;
    
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing mpv: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`mpv stderr: ${stderr}`);
            return;
        }
        console.log(`mpv stdout: ${stdout}`);
    });
}

export default startServer; // Fonksiyonu dışa aktar`