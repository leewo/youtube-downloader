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

// 영상 정보 가져오기
app.post('/info', async (req, res) => {
    console.log("info");
    try {
        const { url } = req.body;
        const info = await ytdl.getInfo(url);

        res.json({
            title: info.videoDetails.title,
            thumbnail: info.videoDetails.thumbnails[0].url,
            duration: info.videoDetails.lengthSeconds,
            formats: info.formats
                .filter(format => format.hasVideo && format.hasAudio)
                .map(format => ({
                    itag: format.itag,
                    quality: format.qualityLabel,
                    container: format.container
                }))
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// 영상 다운로드
app.get('/download', async (req, res) => {
    console.log("download");
    try {
        const { url, quality } = req.query;
        const info = await ytdl.getInfo(url);

        res.header('Content-Disposition', `attachment; filename="${info.videoDetails.title}.mp4"`);
        ytdl(url, {
            quality: quality || 'highest',
            format: 'mp4'
        }).pipe(res);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});

