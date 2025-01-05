'use strict';

const express = require('express');
const ytdl = require('ytdl-core');
const path = require('path');

const app = express();
const port = 3000;

// 미들웨어 설정
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// View 엔진 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 라우트 설정
app.get('/', (req, res) => {
    res.render('index');
});

// 영상 정보 가져오기 - 에러 처리 강화
app.post('/info', async (req, res) => {
    try {
        const { url } = req.body;

        // URL 유효성 검사 추가
        if (!ytdl.validateURL(url)) {
            throw new Error('올바른 YouTube URL이 아닙니다.');
        }

        const info = await ytdl.getInfo(url, {
            requestOptions: {
                headers: {
                    // User-Agent 추가
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            }
        });

        // 필터링된 형식 정보만 전송
        const formats = ytdl.filterFormats(info.formats, 'videoandaudio');

        res.json({
            title: info.videoDetails.title,
            thumbnail: info.videoDetails.thumbnails[0].url,
            duration: info.videoDetails.lengthSeconds,
            formats: formats.map(format => ({
                itag: format.itag,
                quality: format.qualityLabel,
                container: format.container
            }))
        });
    } catch (error) {
        console.error('Error in /info:', error);
        res.status(400).json({
            error: error.message || '영상 정보를 가져오는데 실패했습니다.'
        });
    }
});

// 다운로드 로직 수정
app.get('/download', async (req, res) => {
    try {
        const { url, quality } = req.query;

        if (!ytdl.validateURL(url)) {
            throw new Error('올바른 YouTube URL이 아닙니다.');
        }

        const info = await ytdl.getInfo(url);
        const format = ytdl.chooseFormat(info.formats, {
            quality: quality || 'highest',
            filter: 'videoandaudio'
        });

        res.header('Content-Disposition', `attachment; filename="${info.videoDetails.title}.mp4"`);

        ytdl(url, {
            format: format,
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            }
        }).pipe(res);
    } catch (error) {
        console.error('Error in /download:', error);
        res.status(400).json({
            error: error.message || '다운로드에 실패했습니다.'
        });
    }
});

app.listen(port, () => {
    console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});