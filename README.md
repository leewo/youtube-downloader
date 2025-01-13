# YouTube Downloader

YouTube 동영상을 다운로드할 수 있는 웹 애플리케이션입니다. 비디오, 오디오(MP3), 자막을 다운로드할 수 있습니다.

## 주요 기능
- 고화질 비디오 다운로드 (최대 1080p)
- MP3 오디오 다운로드
- 자막 다운로드 (영어)
- 실시간 다운로드 진행률 표시
- 동영상 정보 미리보기
- 화질 선택 가능

## 설치 요구사항

### Windows
1. Node.js 설치
   - [Node.js 공식 사이트](https://nodejs.org/)에서 LTS 버전 다운로드 및 설치
   - 설치 확인: 
     ```bash
     node --version
     npm --version
     ```

2. Git 설치 (선택사항)
   - [Git 공식 사이트](https://git-scm.com/)에서 다운로드 및 설치
   - 또는 프로젝트를 ZIP 파일로 직접 다운로드

### Ubuntu/Debian
1. Node.js 설치
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. FFmpeg 설치 (필수)
   ```bash
   sudo apt update
   sudo apt install ffmpeg
   ```

3. Git 설치 (선택사항)
   ```bash
   sudo apt install git
   ```

## 설치 방법

1. 프로젝트 클론 또는 다운로드
   ```bash
   git clone https://github.com/yourusername/youtube-downloader.git
   cd youtube-downloader
   ```

2. 의존성 패키지 설치
   ```bash
   npm install
   ```

## 실행 방법

1. 서버 시작
   ```bash
   npm start
   ```

2. 웹 브라우저에서 접속
   ```
   http://localhost:3000
   ```

## 실행 파일로 빌드하기

### Windows용 실행 파일 만들기
```bash
npm run build
```
- dist 폴더에 youtube_down-win-x64.exe 파일이 생성됩니다.

### Linux용 실행 파일 만들기
```bash
npm run build
```
- dist 폴더에 youtube_down-linux-x64 파일이 생성됩니다.

## 주의사항
- 다운로드 속도는 인터넷 연결 속도에 따라 달라질 수 있습니다.
- 일부 영상은 저작권 또는 기타 제한으로 인해 다운로드가 불가능할 수 있습니다.
- 다운로드한 콘텐츠는 개인적인 용도로만 사용해야 합니다.

## 문제 해결

### Ubuntu에서 다운로드 실패 시
- FFmpeg가 설치되어 있는지 확인:
  ```bash
  ffmpeg -version
  ```
- FFmpeg가 설치되어 있지 않다면 설치:
  ```bash
  sudo apt install ffmpeg
  ```

### Windows에서 실행 파일 실행 시 오류
- 방화벽 설정에서 해당 프로그램의 접근을 허용해야 할 수 있습니다.
- 관리자 권한으로 실행해보세요.

## 라이선스
ISC License

## 기여하기
버그 리포트, 기능 제안, 풀 리퀘스트를 환영합니다.