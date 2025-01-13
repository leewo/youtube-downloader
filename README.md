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

1. 소스 코드로 직접 실행
   ```bash
   npm start
   ```

2. 실행 파일로 실행
   - Windows: `youtube_down-win.exe` 더블클릭
   - Linux: `./youtube_down-linux` 실행

3. 웹 브라우저에서 접속
   ```
   http://localhost:3000
   ```

## 실행 파일로 빌드하기

### 빌드 전 요구사항
- Node.js 16 이상
- npm 또는 yarn
- Ubuntu/Debian의 경우 빌드 도구(build-essential) 필요

### 빌드 방법
```bash
npm run build
```

### 빌드 결과물
dist 폴더에 다음 파일들이 생성됩니다:
- Windows: `youtube_down-win.exe`
- Linux: `youtube_down-linux`

## 주의사항
1. 실행 관련
   - 실행 파일과 함께 생성되는 모든 파일(public, views 폴더 등)이 같은 디렉토리에 있어야 합니다.
   - Windows에서는 방화벽 설정에서 해당 포트(3000)를 허용해야 할 수 있습니다.
   - Linux에서는 실행 파일에 실행 권한이 필요합니다: `chmod +x youtube_down-linux`
   - Linux에서는 FFmpeg가 필수로 설치되어 있어야 합니다.

2. 다운로드 관련
   - 다운로드 속도는 인터넷 연결 속도에 따라 달라질 수 있습니다.
   - 일부 영상은 저작권 또는 기타 제한으로 인해 다운로드가 불가능할 수 있습니다.
   - 자막 다운로드는 영상에 영어 자막이 있는 경우에만 가능합니다.
   - 다운로드한 콘텐츠는 개인적인 용도로만 사용해야 합니다.

3. 성능 관련
   - 고화질(1080p) 영상의 경우 다운로드와 병합에 시간이 걸릴 수 있습니다.
   - 메모리 사용량을 고려하여 매우 긴 영상은 피하는 것이 좋습니다.
   - 동시에 여러 파일을 다운로드할 경우 시스템 성능에 영향을 줄 수 있습니다.

## 문제 해결

### 공통
- 포트 3000이 이미 사용 중인 경우 실행이 실패할 수 있습니다.
- 다운로드 중 브라우저를 닫으면 진행 중인 다운로드가 취소됩니다.

### Ubuntu/Linux 관련
- FFmpeg가 설치되어 있는지 확인:
  ```bash
  ffmpeg -version
  ```
- FFmpeg가 설치되어 있지 않다면 설치:
  ```bash
  sudo apt install ffmpeg
  ```
- 실행 권한 확인:
  ```bash
  chmod +x youtube_down-linux
  ```

### Windows 관련
- 방화벽 설정에서 해당 프로그램의 접근을 허용해야 할 수 있습니다.
- 관리자 권한으로 실행해보세요.

## 기여하기
버그 리포트, 기능 제안, 풀 리퀘스트를 환영합니다.