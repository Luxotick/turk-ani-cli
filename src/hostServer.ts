import express from 'express';
import path from 'path';
import { exec } from 'child_process';
import { isExportAssignment } from 'typescript';

const app = express();
const PORT = 8000;

const __dirname = import.meta.dirname
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

const startServer = (episodeName: string) => {
    app.listen(PORT, () => {
        console.log(`Server is running at http://localhost:${PORT}`);
        runMpv(episodeName)
        
    });
}

function runMpv(episodeName: string) {
    const command = `mpv --display-tags-clr --user-agent="Mozilla/5.0" --fullscreen --volume=50 "http://localhost:8000/downloads/${episodeName}/master.m3u8"`;
    
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