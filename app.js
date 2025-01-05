'use strict';

const express = require('express');
const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');

const app = express();
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

        res.json({
            title: info.title,
            thumbnail: info.thumbnail,
            duration: info.duration,
            formats: info.formats
                .filter(format => format.ext === 'mp4' && format.format_note !== 'DASH video')
                .map(format => ({
                    formatId: format.format_id,
                    quality: format.format_note,
                    container: format.ext
                }))
        });
    } catch (error) {
        console.error('Error in /info:', error);
        res.status(400).json({
            error: '영상 정보를 가져오는데 실패했습니다.'
        });
    }
});

// 다운로드 엔드포인트
app.get('/download', async (req, res) => {
    try {
        const { url, quality } = req.query;
        const downloadPath = path.join(__dirname, 'downloads');

        // downloads 폴더가 없으면 생성
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath);
        }

        // 임시 파일명 생성
        const tempFileName = `video-${Date.now()}.mp4`;
        const outputPath = path.join(downloadPath, tempFileName);

        // youtube-dl-exec를 사용한 다운로드
        await youtubedl(url, {
            format: quality || 'best[ext=mp4]',  // mp4 포맷 지정
            output: outputPath,
            // 추가 옵션
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true
        });

        // 파일 존재 확인
        if (!fs.existsSync(outputPath)) {
            throw new Error('다운로드된 파일을 찾을 수 없습니다.');
        }

        // Content-Disposition 헤더 설정
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(tempFileName)}"`);
        res.setHeader('Content-Type', 'video/mp4');

        // 파일 스트림 전송
        const fileStream = fs.createReadStream(outputPath);
        fileStream.pipe(res);

        // 전송 완료 후 임시 파일 삭제
        fileStream.on('end', () => {
            fs.unlinkSync(outputPath);
        });

    } catch (error) {
        console.error('Download Error:', error);
        res.status(400).json({
            error: '다운로드에 실패했습니다: ' + error.message
        });

        // 에러 발생 시 임시 파일 정리
        const tempFiles = fs.readdirSync(path.join(__dirname, 'downloads'));
        tempFiles.forEach(file => {
            if (file.startsWith('video-')) {
                fs.unlinkSync(path.join(__dirname, 'downloads', file));
            }
        });
    }
});

app.listen(port, () => {
    console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});