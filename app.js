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
function formatDate(date) {
    if (typeof date === 'string' && date.length === 8) {
        // YYYYMMDD 형식의 문자열인 경우
        const year = date.substring(0, 4);
        const month = date.substring(4, 6);
        const day = date.substring(6, 8);
        return `${year}${month}${day}`;
    }

    const d = new Date(date);
    if (isNaN(d.getTime())) {
        const today = new Date();
        return today.getFullYear().toString() +
            String(today.getMonth() + 1).padStart(2, '0') +
            String(today.getDate()).padStart(2, '0');
    }

    return d.getFullYear().toString() +
        String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0');
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
        let initialSize = null;
        let totalFragments = null;

        download.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('Download progress:', output);  // 디버깅을 위한 로그

            // 총 fragment 수 확인
            const fragmentsMatch = output.match(/Total fragments: (\d+)/);
            if (fragmentsMatch) {
                totalFragments = parseInt(fragmentsMatch[1]);
            }

            const downloadMatch = output.match(/\[download\].*?(\d+\.\d+)% of ~?\s*([\d.]+)([\w]+) at\s+([\d.]+)([\w]+)\/s ETA (\d+:\d+).*?\(frag (\d+)\/(\d+)\)/);
            if (downloadMatch) {
                const [, , size, sizeUnit, speed, speedUnit, eta, currentFrag, totalFrag] = downloadMatch;

                // 초기 파일 크기 저장
                if (!initialSize) {
                    initialSize = `${size}${sizeUnit}`;
                }

                // fragment 기반 진행률 계산
                const fragProgress = (parseInt(currentFrag) / parseInt(totalFrag)) * 100;

                sendProgress(clientId, {
                    type: 'video',
                    progress: Math.min(Math.round(fragProgress * 10) / 10, 99), // 소수점 1자리까지 표시, 최대 99%
                    size: initialSize,
                    speed: `${speed}${speedUnit}/s`,
                    eta: eta
                });
            }

            // 병합 진행 상태 처리
            if (output.includes('[Merger]')) {
                sendProgress(clientId, {
                    type: 'video',
                    progress: 99.5,
                    status: '파일 병합 중...',
                    size: initialSize
                });
            }

            // 파일 삭제 메시지가 나오면 다운로드 완료로 처리
            if (output.includes('Deleting original file')) {
                sendProgress(clientId, {
                    type: 'video',
                    progress: 100,
                    status: '다운로드 완료!',
                    size: initialSize
                });
            }
        });

        // 에러 처리
        download.stderr.on('data', (data) => {
            console.error('Error:', data.toString());
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

        // 진행 상태 처리
        let initialSize = null;

        download.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('Audio download progress:', output);

            const downloadMatch = output.match(/\[download\].*?(\d+\.\d+)% of ~?\s*([\d.]+)([\w]+) at\s+([\d.]+)([\w]+)\/s ETA (\d+:\d+)/);
            if (downloadMatch) {
                const [, progress, size, sizeUnit, speed, speedUnit, eta] = downloadMatch;

                if (!initialSize) {
                    initialSize = `${size}${sizeUnit}`;
                }

                sendProgress(clientId, {
                    type: 'audio',
                    progress: Math.min(Math.round(parseFloat(progress) * 10) / 10, 99),
                    size: initialSize,
                    speed: `${speed}${speedUnit}/s`,
                    eta: eta
                });
            }

            if (output.includes('[ffmpeg]')) {
                sendProgress(clientId, {
                    type: 'audio',
                    progress: 99.5,
                    status: '오디오 변환 중...',
                    size: initialSize
                });
            }
        });

        // 에러 처리
        download.stderr.on('data', (data) => {
            console.error('Error:', data.toString());
        });

        // 다운로드 완료 후 파일 전송
        download.on('close', () => {
            sendProgress(clientId, {
                type: 'audio',
                progress: 100,
                status: '다운로드 완료!'
            });

            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
            res.setHeader('Content-Type', 'audio/mp3');

            const fileStream = fs.createReadStream(outputPath);
            fileStream.pipe(res);
            fileStream.on('end', () => {
                fs.unlinkSync(outputPath);
            });
        });

    } catch (error) {
        console.error('Audio Download Error:', error);
        sendProgress(clientId, {
            type: 'error',
            message: '오디오 다운로드에 실패했습니다: ' + error.message
        });
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

        console.log('Video info retrieved:', videoInfo.id);

        // 파일명 생성
        const uploadDate = formatDate(videoInfo.upload_date);
        const safeTitle = sanitizeFilename(videoInfo.title);
        const baseFileName = `${uploadDate}_${safeTitle}`;
        const finalFileName = `${baseFileName}.srt`;
        const finalOutputPath = path.join(downloadPath, finalFileName);

        console.log('Attempting to download subtitles...');

        // 자막 다운로드 시도
        const downloadProcess = youtubedl.exec(url, {
            skipDownload: true,
            writeAutoSubs: true,
            writeSubs: true,
            subLangs: 'en.*',  // 모든 영어 자막 시도
            convertSubs: 'srt',
            output: path.join(downloadPath, baseFileName + '.%(ext)s'),
            noCheckCertificates: true,
            noWarnings: true
        });

        // stdout 로깅
        downloadProcess.stdout.on('data', (data) => {
            console.log('Download process output:', data.toString());
        });

        // stderr 로깅
        downloadProcess.stderr.on('data', (data) => {
            console.log('Download process error:', data.toString());
        });

        // 다운로드 프로세스 완료 대기
        await new Promise((resolve, reject) => {
            downloadProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Download process exited with code ${code}`));
                }
            });
        });

        console.log('Download process completed');

        // 가능한 자막 파일명들 확인
        const possibleFiles = [
            finalFileName,
            `${baseFileName}.en.srt`,
            `${baseFileName}.en-US.srt`,
            `${baseFileName}.en-GB.srt`,
            `${baseFileName}.en_US.srt`,
            `${baseFileName}.en_GB.srt`
        ].map(fname => path.join(downloadPath, fname));

        console.log('Checking for subtitle files:', possibleFiles);

        // 존재하는 자막 파일 찾기
        const existingSubtitle = possibleFiles.find(file => fs.existsSync(file));

        if (!existingSubtitle) {
            throw new Error('자막 파일을 찾을 수 없습니다. 이 영상에는 영어 자막이 없거나 자동 생성된 자막을 사용할 수 없습니다.');
        }

        console.log('Found subtitle file:', existingSubtitle);

        // 파일 이름이 finalOutputPath와 다르면 이름 변경
        if (existingSubtitle !== finalOutputPath) {
            fs.renameSync(existingSubtitle, finalOutputPath);
        }

        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalFileName)}"`);
        res.setHeader('Content-Type', 'application/x-subrip');

        const fileStream = fs.createReadStream(finalOutputPath);
        fileStream.pipe(res);
        fileStream.on('end', () => {
            fs.unlinkSync(finalOutputPath);
        });

    } catch (error) {
        console.error('Subtitle Download Error:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack
        });
        res.status(400).json({
            error: '자막 다운로드에 실패했습니다. 이 영상에 영어 자막이 없거나 자동 생성된 자막을 사용할 수 없습니다.'
        });
    }
});

server.listen(port, () => {
    console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});
