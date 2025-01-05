'use strict';

const express = require('express');
const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => {
    res.render('index');
});

// 영상 정보 가져오기
app.post('/info', async (req, res) => {
    try {
        const { url } = req.body;

        const info = await youtubedl(url, {
            dumpSingleJson: true,
            noWarnings: true,
            noCallHome: true,
            preferFreeFormats: true,
            youtubeSkipDashManifest: true
        });

        // 사용 가능한 포맷들을 필터링하고 정리
        const formats = info.formats
            .filter(format => {
                // 비디오와 오디오가 모두 있거나, DASH 포맷(비디오만)인 경우 포함
                return (format.ext === 'mp4' && (format.acodec !== 'none' || format.vcodec !== 'none'));
            })
            .map(format => ({
                formatId: format.format_id,
                quality: format.height ? `${format.height}p` : format.format_note,
                container: format.ext,
                resolution: format.resolution,
                fps: format.fps,
                vcodec: format.vcodec,
                acodec: format.acodec
            }));

        res.json({
            title: info.title,
            thumbnail: info.thumbnail,
            duration: info.duration,
            formats: formats
        });
    } catch (error) {
        console.error('Error in /info:', error);
        res.status(400).json({
            error: '영상 정보를 가져오는데 실패했습니다.'
        });
    }
});

// 영상 제목에서 파일명으로 사용할 수 없는 문자 제거하는 함수
function sanitizeFilename(title) {
    return title.replace(/[<>:"\/\\|?*\x00-\x1F]/g, '_').trim();
}

// 날짜를 YYYYMMDD 형식으로 변환하는 함수
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.getFullYear().toString() +
        (date.getMonth() + 1).toString().padStart(2, '0') +
        date.getDate().toString().padStart(2, '0');
}

// 웹소켓 연결 관리
const clients = new Map();

wss.on('connection', (ws, req) => {
    const clientId = req.url.split('=')[1];  // URL에서 clientId 추출
    if (clientId) {
        clients.set(clientId, ws);
        console.log(`Client connected with ID: ${clientId}`);
    }

    ws.on('close', () => {
        clients.delete(clientId);
        console.log(`Client disconnected: ${clientId}`);
    });
});

// 진행 상태 전송 함수
function sendProgress(clientId, data) {
    const ws = clients.get(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            console.log('Sending progress to client:', clientId, data); // 디버깅용 로그
            ws.send(JSON.stringify(data));
        } catch (error) {
            console.error('Error sending progress:', error);
        }
    } else {
        console.log('WebSocket not available for client:', clientId);
    }
}

// 비디오 다운로드
app.get('/download', async (req, res) => {
    try {
        const { url, quality, clientId } = req.query;
        const downloadPath = path.join(__dirname, 'downloads');

        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath);
        }

        // 영상 정보 가져오기
        const videoInfo = await youtubedl(url, {
            dumpSingleJson: true,
            noWarnings: true,
            noCheckCertificates: true
        });

        // 파일명 생성 (업로드일자_제목.mp4)
        const uploadDate = formatDate(videoInfo.upload_date);
        const safeTitle = sanitizeFilename(videoInfo.title);
        const fileName = `${uploadDate}_${safeTitle}.mp4`;
        const outputPath = path.join(downloadPath, fileName);

        // 진행 상태 추적을 위한 설정
        let startTime = Date.now();
        let downloadedBytes = 0;
        let totalBytes = 0;

        // 비디오 다운로드
        const heightValue = parseInt(quality.replace('p', ''));
        const formatString = `bestvideo[height=${heightValue}]+bestaudio/best[height<=${heightValue}]`;

        const download = youtubedl.exec(url, {
            format: formatString,
            mergeOutputFormat: 'mp4',
            output: outputPath,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            progress: true
        });

        // 진행 상태 처리
        download.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('Download progress:', output);  // 디버깅을 위한 로그

            const progressMatch = output.match(/(\d+\.\d+)% of ~?(\d+\.\d+)(\w+) at\s+(\d+\.\d+)(\w+)\/s/);
            if (progressMatch) {
                const [, percent, size, sizeUnit, speed, speedUnit] = progressMatch;

                sendProgress(clientId, {
                    type: 'video',
                    progress: parseFloat(percent),
                    size: `${size}${sizeUnit}`,
                    speed: `${speed}${speedUnit}/s`
                });
            }
        });

        // 다운로드 완료 후 파일 전송
        download.on('close', () => {
            sendProgress(clientId, { type: 'video', progress: 100 });

            // 파일 전송
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
            res.setHeader('Content-Type', 'video/mp4');

            const fileStream = fs.createReadStream(outputPath);
            fileStream.pipe(res);
            fileStream.on('end', () => {
                fs.unlinkSync(outputPath);
            });
        });

    } catch (error) {
        console.error('Download Error:', error);
        sendProgress(clientId, {
            type: 'error',
            message: '다운로드에 실패했습니다: ' + error.message
        });
        res.status(400).json({ error: '다운로드에 실패했습니다: ' + error.message });
    }
});

// 오디오(MP3) 다운로드
app.get('/download-audio', async (req, res) => {
    try {
        const { url, clientId } = req.query;
        const downloadPath = path.join(__dirname, 'downloads');

        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath);
        }

        // 영상 정보 가져오기
        const videoInfo = await youtubedl(url, {
            dumpSingleJson: true,
            noWarnings: true,
            noCheckCertificates: true
        });

        // 파일명 생성
        const uploadDate = formatDate(videoInfo.upload_date);
        const safeTitle = sanitizeFilename(videoInfo.title);
        const fileName = `${uploadDate}_${safeTitle}.mp3`;
        const outputPath = path.join(downloadPath, fileName);

        // MP3 다운로드
        const download = youtubedl.exec(url, {
            extractAudio: true,
            audioFormat: 'mp3',
            audioQuality: 0, // 최고 품질
            output: outputPath,
            noCheckCertificates: true,
            noWarnings: true,
            progress: true
        });

        download.stdout.on('data', (data) => {
            const progressMatch = data.toString().match(/(\d+\.\d+)% of ~?(\d+\.\d+)(\w+) at\s+(\d+\.\d+)(\w+)\/s/);
            if (progressMatch) {
                const [, percent, size, sizeUnit, speed, speedUnit] = progressMatch;

                sendProgress(clientId, {
                    type: 'audio',
                    progress: parseFloat(percent),
                    size: `${size}${sizeUnit}`,
                    speed: `${speed}${speedUnit}/s`
                });
            }
        });

        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.setHeader('Content-Type', 'audio/mp3');

        const fileStream = fs.createReadStream(outputPath);
        fileStream.pipe(res);
        fileStream.on('end', () => {
            fs.unlinkSync(outputPath);
        });

    } catch (error) {
        console.error('Audio Download Error:', error);
        res.status(400).json({ error: '오디오 다운로드에 실패했습니다: ' + error.message });
    }
});

// 자막 다운로드
app.get('/download-subtitle', async (req, res) => {
    try {
        const { url } = req.query;
        const downloadPath = path.join(__dirname, 'downloads');

        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath);
        }

        // 영상 정보 가져오기
        const videoInfo = await youtubedl(url, {
            dumpSingleJson: true,
            noWarnings: true,
            noCheckCertificates: true
        });

        // 파일명 생성
        const uploadDate = formatDate(videoInfo.upload_date);
        const safeTitle = sanitizeFilename(videoInfo.title);
        const fileName = `${uploadDate}_${safeTitle}.srt`;
        const outputPath = path.join(downloadPath, fileName);

        // 자막 다운로드
        await youtubedl(url, {
            skipDownload: true,
            writeAutoSub: true,
            subLang: 'en',
            subFormat: 'srt',
            output: outputPath,
            noCheckCertificates: true,
            noWarnings: true
        });

        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.setHeader('Content-Type', 'application/x-subrip');

        const fileStream = fs.createReadStream(outputPath);
        fileStream.pipe(res);
        fileStream.on('end', () => {
            fs.unlinkSync(outputPath);
        });

    } catch (error) {
        console.error('Subtitle Download Error:', error);
        res.status(400).json({ error: '자막 다운로드에 실패했습니다: ' + error.message });
    }
});

server.listen(port, () => {
    console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});
