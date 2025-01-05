async function getVideoInfo() {
    const videoUrl = document.getElementById('videoUrl').value;
    const loading = document.getElementById('loading');
    const videoInfo = document.getElementById('videoInfo');

    if (!videoUrl) {
        alert('URL을 입력해주세요.');
        return;
    }

    try {
        loading.style.display = 'block';
        videoInfo.style.display = 'none';

        const response = await fetch('/info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: videoUrl })
        });

        if (!response.ok) {
            throw new Error('영상 정보를 가져오는데 실패했습니다.');
        }

        const data = await response.json();

        // 영상 정보 표시
        document.getElementById('thumbnail').src = data.thumbnail;
        document.getElementById('videoTitle').textContent = data.title;
        document.getElementById('videoDuration').textContent =
            `재생 시간: ${Math.floor(data.duration / 60)}분 ${data.duration % 60}초`;

        // 화질 옵션 설정
        const qualitySelect = document.getElementById('qualitySelect');
        qualitySelect.innerHTML = '<option value="">화질 선택</option>';

        // 중복 제거 및 정렬
        const uniqueQualities = [...new Set(data.formats
            .filter(format => format.quality && format.quality.includes('p'))
            .map(format => format.quality))]
            .sort((a, b) => {
                return parseInt(b.replace('p', '')) - parseInt(a.replace('p', ''));
            });

        uniqueQualities.forEach(quality => {
            const option = document.createElement('option');
            option.value = quality;
            option.textContent = `${quality}`;
            qualitySelect.appendChild(option);
        });

        videoInfo.style.display = 'block';
    } catch (error) {
        alert(error.message);
    } finally {
        loading.style.display = 'none';
    }
}

function downloadVideo() {
    const videoUrl = document.getElementById('videoUrl').value;
    const quality = document.getElementById('qualitySelect').value;

    if (!videoUrl) {
        alert('URL을 입력해주세요.');
        return;
    }

    if (!quality) {
        alert('화질을 선택해주세요.');
        return;
    }

    // 다운로드 링크 생성 및 클릭
    const downloadUrl = `/download?url=${encodeURIComponent(videoUrl)}&quality=${quality}`;
    window.location.href = downloadUrl;
}

function downloadAudio() {
    const videoUrl = document.getElementById('videoUrl').value;
    if (!videoUrl) {
        alert('URL을 입력해주세요.');
        return;
    }
    window.location.href = `/download-audio?url=${encodeURIComponent(videoUrl)}`;
}

function downloadSubtitle() {
    const videoUrl = document.getElementById('videoUrl').value;
    if (!videoUrl) {
        alert('URL을 입력해주세요.');
        return;
    }
    window.location.href = `/download-subtitle?url=${encodeURIComponent(videoUrl)}`;
}