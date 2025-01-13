'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const http = require('http');
const os = require('os');

const getRootDir = () => {
    const isPackaged = 'pkg' in process;
    if (isPackaged) {
        return path.dirname(process.execPath);
    }
    return __dirname;
};

const rootDir = getRootDir();
console.log('Root directory:', rootDir);

// 디렉토리 존재 여부 확인 및 로깅
console.log('Public directory exists:', fs.existsSync(path.join(rootDir, 'public')));
console.log('Views directory exists:', fs.existsSync(path.join(rootDir, 'views')));

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(rootDir, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(rootDir, 'views'));

// Public 디렉토리에 대한 추가 로깅
console.log('Static directory content:', fs.readdirSync(path.join(rootDir, 'public')));
console.log('Views directory content:', fs.readdirSync(path.join(rootDir, 'views')));

// 라우트 설정
app.get('/', (req, res) => {
    console.log('Rendering index page');
    console.log('View engine:', app.get('view engine'));
    console.log('Views directory:', app.get('views'));
    res.render('index');
});

// downloads 디렉토리 설정
const downloadsDir = path.join(rootDir, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir);
}

const getBinaryPath = () => {
    const isPackaged = 'pkg' in process;
    const binName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    let binPath;

    if (isPackaged) {
        // 패키징된 실행 파일인 경우
        binPath = path.join(rootDir, binName);
    } else {
        // 개발 환경인 경우
        binPath = path.join(__dirname, 'node_modules', 'youtube-dl-exec', 'bin', binName);

        // binPath가 존재하지 않으면 youtube-dl-exec의 기본 경로 사용
        if (!fs.existsSync(binPath)) {
            const ytdlExec = require('youtube-dl-exec');
            binPath = ytdlExec.getBinaryPath();
        }
    }

    console.log('Binary path:', binPath);
    console.log('Binary exists:', fs.existsSync(binPath));
    return binPath;
};

const execYtDlp = async (url, args = []) => {
    const binPath = getBinaryPath();
    console.log('Executing yt-dlp with binary path:', binPath);

    return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        const ytProcess = spawn(binPath || 'yt-dlp', [
            url,
            '--dump-single-json',
            '--no-warnings',
            '--no-call-home',
            '--prefer-free-formats',
            '--youtube-skip-dash-manifest',
            ...args
        ]);

        let stdout = '';
        let stderr = '';

        ytProcess.stdout.on('data', (data) => {
            stdout += data;
        });

        ytProcess.stderr.on('data', (data) => {
            stderr += data;
            console.error('yt-dlp stderr:', data.toString());
        });

        ytProcess.on('error', (error) => {
            console.error('yt-dlp spawn error:', error);
            reject(error);
        });

        ytProcess.on('close', (code) => {
            console.log('yt-dlp process exited with code:', code);
            if (code === 0) {
                try {
                    const data = JSON.parse(stdout);
                    resolve(data);
                } catch (error) {
                    console.error('Failed to parse yt-dlp output:', error);
                    reject(new Error('Failed to parse yt-dlp output'));
                }
            } else {
                console.error('yt-dlp stderr output:', stderr);
                reject(new Error(stderr || 'yt-dlp command failed'));
            }
        });
    });
};

// 영상 정보 가져오기
app.post('/info', async (req, res) => {
    try {
        const { url } = req.body;
        console.log('Fetching info for URL:', url);

        const info = await execYtDlp(url);

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

// 임시 디렉토리 생성 함수
const getTempDir = () => {
    const tempDir = path.join(os.tmpdir(), 'youtube-downloader');
    if (!fs.existsSync(tempDir)) {
        try {
            fs.mkdirSync(tempDir, { recursive: true });
        } catch (error) {
            console.error('Error creating temp directory:', error);
            // 실패하면 os의 임시 디렉토리 사용
            return os.tmpdir();
        }
    }
    return tempDir;
};

// 비디오 다운로드
app.get('/download', async (req, res) => {
    const { url, quality, clientId } = req.query;

    try {
        const tempDir = getTempDir();
        console.log('Using temp directory:', tempDir);

        // 영상 정보 가져오기
        const videoInfo = await execYtDlp(url, ['--no-warnings']);

        // 날짜 포함한 파일명 생성
        const uploadDate = formatDate(videoInfo.upload_date);
        const safeTitle = sanitizeFilename(videoInfo.title);
        const fileName = `${uploadDate}_${safeTitle}.mp4`;
        const outputPath = path.join(tempDir, fileName);

        console.log('Output path:', outputPath);

        // 다운로드 명령 실행
        const heightValue = parseInt(quality.replace('p', ''));
        const downloadProcess = require('child_process').spawn(getBinaryPath(), [
            url,
            '-f', `bestvideo[height=${heightValue}]+bestaudio/best[height<=${heightValue}]`,
            '-o', outputPath,
            '--merge-output-format', 'mp4'
        ]);

        let progress = 0;

        downloadProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('Download progress:', output);

            // Progress parsing
            const downloadMatch = output.match(/\[download\]\s+(\d+\.?\d*)%/);
            if (downloadMatch) {
                progress = Math.min(parseFloat(downloadMatch[1]), 99);
                if (clientId) {
                    sendProgress(clientId, {
                        type: 'video',
                        progress: progress,
                        status: '다운로드 중...'
                    });
                }
            }

            if (output.includes('[Merger]')) {
                if (clientId) {
                    sendProgress(clientId, {
                        type: 'video',
                        progress: 99.5,
                        status: '파일 병합 중...'
                    });
                }
            }
        });

        downloadProcess.stderr.on('data', (data) => {
            console.error('Download error:', data.toString());
        });

        // Wait for download to complete
        await new Promise((resolve, reject) => {
            downloadProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Download failed with code ${code}`));
                }
            });
        });

        if (fs.existsSync(outputPath)) {
            if (clientId) {
                sendProgress(clientId, {
                    type: 'video',
                    progress: 100,
                    status: '다운로드 완료!'
                });
            }

            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
            res.setHeader('Content-Type', 'video/mp4');

            const fileStream = fs.createReadStream(outputPath);
            fileStream.pipe(res);
            fileStream.on('end', () => {
                try {
                    fs.unlinkSync(outputPath);
                } catch (error) {
                    console.error('Error removing temp file:', error);
                }
            });
        } else {
            throw new Error('Downloaded file not found');
        }
    } catch (error) {
        console.error('Download Error:', error);
        if (clientId) {
            sendProgress(clientId, {
                type: 'error',
                message: '다운로드에 실패했습니다: ' + error.message
            });
        }
        res.status(500).json({ error: '다운로드에 실패했습니다: ' + error.message });
    }
});

// MP3 다운로드용 실행 함수
const execYtDlpAudio = async (url, outputPath) => {
    const binPath = getBinaryPath();
    console.log('Executing yt-dlp for audio with path:', binPath);

    return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        const ytProcess = spawn(binPath || 'yt-dlp', [
            url,
            '-x',                      // 오디오 추출
            '--audio-format', 'mp3',   // MP3 형식
            '--audio-quality', '0',    // 최고 품질
            '-o', outputPath
        ]);

        ytProcess.stdout.on('data', (data) => {
            console.log('Audio download progress:', data.toString());
        });

        ytProcess.stderr.on('data', (data) => {
            console.error('Audio download error:', data.toString());
        });

        ytProcess.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error('Audio download failed'));
            }
        });
    });
};

// 오디오(MP3) 다운로드
app.get('/download-audio', async (req, res) => {
    const { url, clientId } = req.query;

    try {
        const tempDir = getTempDir();
        console.log('Using temp directory for audio:', tempDir);

        // 영상 정보 가져오기
        const videoInfo = await execYtDlp(url, ['--no-warnings']);

        // 파일명 생성 (날짜 포함)
        const uploadDate = formatDate(videoInfo.upload_date);
        const safeTitle = sanitizeFilename(videoInfo.title);
        const fileName = `${uploadDate}_${safeTitle}.mp3`;
        const outputPath = path.join(tempDir, fileName);

        console.log('MP3 output path:', outputPath);

        // MP3 다운로드
        if (clientId) {
            sendProgress(clientId, {
                type: 'audio',
                progress: 0,
                status: '다운로드 시작...'
            });
        }

        await execYtDlpAudio(url, outputPath);

        if (clientId) {
            sendProgress(clientId, {
                type: 'audio',
                progress: 100,
                status: '다운로드 완료!'
            });
        }

        // 파일 전송
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.setHeader('Content-Type', 'audio/mp3');

        const fileStream = fs.createReadStream(outputPath);
        fileStream.pipe(res);
        fileStream.on('end', () => {
            try {
                fs.unlinkSync(outputPath);
            } catch (error) {
                console.error('Error removing temp file:', error);
            }
        });

    } catch (error) {
        console.error('Audio Download Error:', error);
        if (clientId) {
            sendProgress(clientId, {
                type: 'error',
                message: '오디오 다운로드에 실패했습니다: ' + error.message
            });
        }
        res.status(400).json({ error: '오디오 다운로드에 실패했습니다: ' + error.message });
    }
});

const execYtDlpSubtitle = async (url, outputPath) => {
    const binPath = getBinaryPath();
    console.log('Executing yt-dlp for subtitles with path:', binPath);

    return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        const ytProcess = spawn(binPath || 'yt-dlp', [
            url,
            '--skip-download',         // 비디오 다운로드 건너뛰기
            '--write-auto-sub',        // 자동 생성 자막
            '--write-sub',             // 일반 자막
            '--sub-lang', 'en.*',      // 영어 자막
            '--convert-subs', 'srt',   // SRT 형식으로 변환
            '-o', outputPath
        ]);

        let stdout = '';
        ytProcess.stdout.on('data', (data) => {
            stdout += data;
            console.log('Subtitle download progress:', data.toString());
        });

        ytProcess.stderr.on('data', (data) => {
            console.error('Subtitle download error:', data.toString());
        });

        ytProcess.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error('Subtitle download failed'));
            }
        });
    });
};

// 자막 다운로드
app.get('/download-subtitle', async (req, res) => {
    const { url } = req.query;

    try {
        const tempDir = getTempDir();
        console.log('Using temp directory for subtitle:', tempDir);

        // 영상 정보 가져오기
        const videoInfo = await execYtDlp(url, ['--no-warnings']);

        // 파일명 생성
        const uploadDate = formatDate(videoInfo.upload_date);
        const safeTitle = sanitizeFilename(videoInfo.title);
        const baseFileName = `${uploadDate}_${safeTitle}`;
        const finalFileName = `${baseFileName}.srt`;
        const outputPath = path.join(tempDir, baseFileName);

        console.log('Attempting to download subtitles...');

        // 자막 다운로드 실행
        await execYtDlpSubtitle(url, outputPath);

        // 가능한 자막 파일명들 확인
        const possibleFiles = [
            `${outputPath}.srt`,
            `${outputPath}.en.srt`,
            `${outputPath}.en-US.srt`,
            `${outputPath}.en-GB.srt`,
            `${outputPath}.en_US.srt`,
            `${outputPath}.en_GB.srt`
        ];

        console.log('Checking for subtitle files:', possibleFiles);

        // 존재하는 자막 파일 찾기
        const existingSubtitle = possibleFiles.find(file => fs.existsSync(file));

        if (!existingSubtitle) {
            throw new Error('자막 파일을 찾을 수 없습니다. 이 영상에는 영어 자막이 없거나 자동 생성된 자막을 사용할 수 없습니다.');
        }

        console.log('Found subtitle file:', existingSubtitle);

        // 파일 전송
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalFileName)}"`);
        res.setHeader('Content-Type', 'application/x-subrip');

        const fileStream = fs.createReadStream(existingSubtitle);
        fileStream.pipe(res);
        fileStream.on('end', () => {
            try {
                // 모든 가능한 자막 파일 삭제 시도
                possibleFiles.forEach(file => {
                    if (fs.existsSync(file)) {
                        fs.unlinkSync(file);
                    }
                });
            } catch (error) {
                console.error('Error removing temp files:', error);
            }
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
