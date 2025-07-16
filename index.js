#!/usr/bin/env node

const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const createLogger = require('progress-estimator');
const inquirer = require('inquirer');
const logger = createLogger({
  spinner: {
    interval: 80,
    frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  }
});

// 사용법을 출력하는 함수
function showUsage() {
  console.log(`
YouTube 동영상 다운로더 (최고 화질)

사용법:
  youtube <YouTube_URL> [옵션]

옵션:
  --folderName <폴더명>   다운로드할 폴더명 지정 (기본값: 영상 제목)
  --parentFolder <폴더>   부모 폴더 지정 (예: --parentFolder "AA" → AA/영상제목/)
  --output-dir <폴더>     다운로드할 폴더 지정 (기본값: /volume1/media/datas/youtubes/폴더명/)
  --filename <파일명>     파일명 지정 (확장자 제외)
  --audio-only           오디오만 다운로드
  --quality <품질>       최소 품질 지정 (예: 720, 1080, 1440, 2160)
  --auto                 자동 선택 모드 (인터랙티브 선택 건너뛰기)
  --help                 도움말 표시

폴더명 예약어:
  예약어들이 현재 날짜/시간으로 자동 치환됩니다:
  {fullTime} → YYMMDD_HHmmss (예: 231215_143022)
  {date} → YYMMDD (예: 231215)
  {year} 또는 {y} → YY (예: 23)
  {month} 또는 {m} → MM (예: 12)
  {day} 또는 {d} → DD (예: 15)
  {time} → HHmmss (예: 143022)
  {hour} 또는 {h} → HH (예: 14)
  {minute} 또는 {min} → mm (예: 30)
  {second} 또는 {sec} → ss (예: 22)
  
  예: "이번플리_{date}_{time}" → "이번플리_231215_143022"

예시:
  youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ
  youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ --folderName "이번플리_{date}_{time}"
  youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ --parentFolder "강의"
  youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ --parentFolder "음악" --folderName "좋은노래"
  youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ --audio-only
  youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ --output-dir ./videos
  youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ --quality 1080
  youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ --auto
`);
}

// 현재 날짜/시간 정보를 반환하는 함수
function getCurrentDateTime() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2); // YY
  const month = (now.getMonth() + 1).toString().padStart(2, '0'); // MM
  const day = now.getDate().toString().padStart(2, '0'); // DD
  const hours = now.getHours().toString().padStart(2, '0'); // HH
  const minutes = now.getMinutes().toString().padStart(2, '0'); // mm
  const seconds = now.getSeconds().toString().padStart(2, '0'); // ss

  return {
    fullTime: `${year}${month}${day}_${hours}${minutes}${seconds}`,
    date: `${year}${month}${day}`,
    year: year,
    y: year,
    month: month,
    m: month,
    day: day,
    d: day,
    time: `${hours}${minutes}${seconds}`,
    hour: hours,
    h: hours,
    minute: minutes,
    min: minutes,
    second: seconds,
    sec: seconds
  };
}

// 폴더명의 예약어를 치환하는 함수
function replacePlaceholders(folderName) {
  const dateTime = getCurrentDateTime();

  return folderName
    .replace(/{fullTime}/g, dateTime.fullTime)
    .replace(/{date}/g, dateTime.date)
    .replace(/{year}/g, dateTime.year)
    .replace(/{y}/g, dateTime.y)
    .replace(/{month}/g, dateTime.month)
    .replace(/{m}/g, dateTime.m)
    .replace(/{day}/g, dateTime.day)
    .replace(/{d}/g, dateTime.d)
    .replace(/{time}/g, dateTime.time)
    .replace(/{hour}/g, dateTime.hour)
    .replace(/{h}/g, dateTime.h)
    .replace(/{minute}/g, dateTime.minute)
    .replace(/{min}/g, dateTime.min)
    .replace(/{second}/g, dateTime.second)
    .replace(/{sec}/g, dateTime.sec);
}

// 파일명을 최소한으로만 안전하게 만드는 함수 (금지된 문자만 _로 대체)
function minimalSanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_');
}

// 폴더명을 안전하게 만드는 함수
function sanitizeFolderName(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '_') // 파일 시스템에서 금지된 문자 제거
    .replace(/\s+/g, '_') // 공백을 언더스코어로 변경
    .replace(/[^\w\-_\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g, '') // 한글, 영문, 숫자, 언더스코어, 하이픈만 허용
    .substring(0, 100); // 길이 제한
}

// youtube-dl-exec가 사용 가능한지 확인하는 함수
async function checkYoutubeDl() {
  try {
    await youtubedl('--version');
    return true;
  } catch (error) {
    return false;
  }
}

// 동영상 정보를 가져오는 함수
async function getVideoInfo(url) {
  try {
    const info = await youtubedl(url, {
      dumpJson: true,
      noPlaylist: true
    });
    return info;
  } catch (error) {
    throw new Error(`동영상 정보를 가져올 수 없습니다: ${error.message}`);
  }
}

// 사용 가능한 포맷들을 정리하는 함수
function organizeFormats(formats) {
  const organized = {
    videoAudio: [],
    videoOnly: [],
    audioOnly: []
  };

  // 비디오+오디오가 포함된 포맷들
  organized.videoAudio = formats.filter(f =>
    f.vcodec !== 'none' && f.acodec !== 'none' && f.height
  ).sort((a, b) => b.height - a.height);

  // 비디오만 있는 포맷들
  organized.videoOnly = formats.filter(f =>
    f.vcodec !== 'none' && f.acodec === 'none' && f.height
  ).sort((a, b) => b.height - a.height);

  // 오디오만 있는 포맷들
  organized.audioOnly = formats.filter(f =>
    f.vcodec === 'none' && f.acodec !== 'none'
  ).sort((a, b) => (b.abr || 0) - (a.abr || 0));

  return organized;
}

// 사용자가 포맷을 선택하는 함수
async function selectFormat(formats) {
  const organized = organizeFormats(formats);
  const choices = [];

  // 비디오+오디오 포맷 추가
  if (organized.videoAudio.length > 0) {
    choices.push({
      name: '🎬 비디오+오디오 포맷',
      disabled: '───────────────'
    });
    organized.videoAudio.slice(0, 10).forEach((f, index) => {
      const size = f.filesize ? Math.round(f.filesize / 1024 / 1024) + 'MB' : 'N/A';
      choices.push({
        name: `  ${f.height}p (${f.ext}) - ${size}`,
        value: f.format_id,
        short: `${f.height}p`
      });
    });
  }

  // 비디오 전용 포맷 추가
  if (organized.videoOnly.length > 0) {
    choices.push({
      name: '🎥 비디오 전용 포맷',
      disabled: '───────────────'
    });
    organized.videoOnly.slice(0, 10).forEach((f, index) => {
      const size = f.filesize ? Math.round(f.filesize / 1024 / 1024) + 'MB' : 'N/A';
      choices.push({
        name: `  ${f.height}p (${f.ext}) - ${size}`,
        value: f.format_id,
        short: `${f.height}p`
      });
    });
  }

  // 오디오 전용 포맷 추가
  if (organized.audioOnly.length > 0) {
    choices.push({
      name: '🎵 오디오 전용 포맷',
      disabled: '───────────────'
    });
    organized.audioOnly.slice(0, 5).forEach((f, index) => {
      const bitrate = f.abr ? f.abr + 'kbps' : 'N/A';
      choices.push({
        name: `  ${f.ext} - ${bitrate}`,
        value: f.format_id,
        short: `${f.ext}`
      });
    });
  }

  // 자동 선택 옵션 추가
  choices.push({
    name: '───────────────',
    disabled: '───────────────'
  });
  choices.push({
    name: '🤖 자동 선택 (최고 품질)',
    value: 'auto',
    short: '자동'
  });

  const prompt = inquirer.createPromptModule();
  const { selectedFormat } = await prompt([
    {
      type: 'list',
      name: 'selectedFormat',
      message: '다운로드할 포맷을 선택하세요:',
      choices: choices,
      pageSize: 20
    }
  ]);

  return selectedFormat;
}

// 사용 가능한 포맷들을 표시하는 함수
function showAvailableFormats(formats) {
  const organized = organizeFormats(formats);

  console.log('\n📋 사용 가능한 포맷들:');

  if (organized.videoAudio.length > 0) {
    console.log('\n🎬 비디오+오디오 포맷:');
    organized.videoAudio.slice(0, 10).forEach((f, index) => {
      const size = f.filesize ? Math.round(f.filesize / 1024 / 1024) + 'MB' : 'N/A';
      console.log(`  ${index + 1}. ${f.height}p (${f.ext}) - ${size} [format_id: ${f.format_id}]`);
    });
  }

  if (organized.videoOnly.length > 0) {
    console.log('\n🎥 비디오 전용 포맷:');
    organized.videoOnly.slice(0, 10).forEach((f, index) => {
      const size = f.filesize ? Math.round(f.filesize / 1024 / 1024) + 'MB' : 'N/A';
      console.log(`  ${index + 1}. ${f.height}p (${f.ext}) - ${size} [format_id: ${f.format_id}]`);
    });
  }

  if (organized.audioOnly.length > 0) {
    console.log('\n🎵 오디오 전용 포맷:');
    organized.audioOnly.slice(0, 5).forEach((f, index) => {
      const bitrate = f.abr ? f.abr + 'kbps' : 'N/A';
      console.log(`  ${index + 1}. ${f.ext} - ${bitrate} [format_id: ${f.format_id}]`);
    });
  }

  return organized;
}

// 최고 품질의 포맷을 선택하는 함수
function selectBestFormat(formats) {
  // 비디오+오디오가 포함된 포맷 중에서 최고 품질 선택
  const videoFormats = formats.filter(f =>
    f.vcodec !== 'none' && f.acodec !== 'none' && f.height
  );

  if (videoFormats.length > 0) {
    // 높이(height) 기준으로 정렬하여 최고 품질 선택
    return videoFormats.sort((a, b) => b.height - a.height)[0];
  }

  // 비디오만 있는 포맷 중에서 최고 품질 선택
  const videoOnlyFormats = formats.filter(f =>
    f.vcodec !== 'none' && f.acodec === 'none' && f.height
  );

  if (videoOnlyFormats.length > 0) {
    return videoOnlyFormats.sort((a, b) => b.height - a.height)[0];
  }

  return null;
}

// 동영상을 다운로드하는 함수
async function downloadVideo(url, videoInfo, folderName, selectedFormat, options = {}) {
  try {
    // 포맷 문자열 생성
    let formatString;

    if (selectedFormat === 'auto') {
      // 자동 선택 (최고 품질 비디오 + 최고 품질 오디오)
      if (options.quality) {
        formatString = `bestvideo[height>=${options.quality}]+bestaudio/bestvideo+bestaudio/best`;
      } else {
        formatString = 'bestvideo+bestaudio/best';
      }
    } else {
      // 사용자가 선택한 특정 포맷
      formatString = selectedFormat;
    }

    const downloadOptions = {
      noPlaylist: true,
      format: formatString,
      mergeOutputFormat: 'mp4',
      writeThumbnail: true,
      writeDescription: true,
      writeInfoJson: true
    };

    // 기본 출력 폴더 설정 (/volume1/media/datas/youtubes/사용자폴더명/)
    const defaultOutputDir = path.join('/volume1/media/datas', 'youtubes', folderName);

    // 출력 폴더 설정
    if (options.outputDir) {
      downloadOptions.output = path.join(options.outputDir, '%(title)s.%(ext)s');
    } else {
      // 기본 폴더에 저장하되, 파일명은 간단하게
      downloadOptions.output = path.join(defaultOutputDir, 'video.%(ext)s');
    }

    // 파일명 지정
    if (options.filename) {
      downloadOptions.output = path.join(defaultOutputDir, `${options.filename}.%(ext)s`);
    } else {
      // 파일명을 영상 제목(거의 그대로)으로 지정 (금지된 문자만 _로 대체)
      const safeTitle = minimalSanitizeFilename(videoInfo.title);
      downloadOptions.output = path.join(defaultOutputDir, `${safeTitle}.%(ext)s`);
    }

    // 오디오만 다운로드
    if (options.audioOnly) {
      downloadOptions.format = 'bestaudio[ext=m4a]/bestaudio';
      downloadOptions.extractAudio = true;
      downloadOptions.audioFormat = 'mp3';
      delete downloadOptions.writeThumbnail;
      delete downloadOptions.writeDescription;
    }

    // 출력 폴더 생성
    const outputDir = path.dirname(downloadOptions.output.replace('%(title)s', videoInfo.title).replace('%(ext)s', 'mp4'));
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      // console.log(`📁 폴더 생성: ${outputDir}`);
    }

    // console.log('다운로드 시작...');
    // console.log(`📂 저장 위치: ${outputDir}`);

    // progress-estimator logger로 다운로드 중에만 스피너 출력
    const downloadPromise = youtubedl(url, downloadOptions);
    await logger(downloadPromise, `다운로드 중: ${videoInfo.title}`);

    console.log(`\n✅ 다운로드 완료! (📁 ${outputDir})`);
  } catch (error) {
    throw new Error(`다운로드 실패: ${error.message}`);
  }
}

// 메인 함수
async function main() {
  const args = process.argv.slice(2);

  // 도움말 표시
  if (args.includes('--help') || args.length === 0) {
    showUsage();
    return;
  }

  // 옵션 파싱
  const options = {};
  const remainingArgs = [];

  for (let i = 0; i < args.length; i++) {
    let skipNext = false;

    switch (args[i]) {
      case '--folderName':
        options.folderName = args[++i];
        skipNext = true;
        break;
      case '--parentFolder':
        options.parentFolder = args[++i];
        skipNext = true;
        break;
      case '--output-dir':
        options.outputDir = args[++i];
        skipNext = true;
        break;
      case '--filename':
        options.filename = args[++i];
        skipNext = true;
        break;
      case '--audio-only':
        options.audioOnly = true;
        break;
      case '--quality':
        options.quality = parseInt(args[++i]);
        skipNext = true;
        break;
      case '--auto':
        options.auto = true;
        break;
    }

    // 옵션이 아닌 경우 remainingArgs에 추가 (옵션 값은 제외)
    if (!args[i].startsWith('--') && !skipNext) {
      remainingArgs.push(args[i]);
    }
  }

  // URL 추출 (남은 인자 중 첫 번째)
  if (remainingArgs.length === 0) {
    console.error('❌ YouTube URL이 필요합니다.');
    showUsage();
    return;
  }

  const url = remainingArgs[0];

  // YouTube URL 검증
  if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
    console.error('❌ 유효한 YouTube URL이 아닙니다.');
    return;
  }

  try {
    // youtube-dl-exec 사용 가능 확인
    const hasYoutubeDl = await checkYoutubeDl();
    if (!hasYoutubeDl) {
      console.error('❌ youtube-dl-exec가 제대로 설정되지 않았습니다.');
      console.log('\n해결 방법:');
      console.log('  npm install youtube-dl-exec');
      console.log('  또는');
      console.log('  yarn add youtube-dl-exec');
      return;
    }

    // 출력 폴더 생성
    if (options.outputDir && !fs.existsSync(options.outputDir)) {
      fs.mkdirSync(options.outputDir, { recursive: true });
      console.log(`📁 출력 폴더 생성: ${options.outputDir}`);
    }

    // 동영상 정보 가져오기
    console.log('📹 동영상 정보를 가져오는 중...');
    const videoInfo = await getVideoInfo(url);

    // 폴더명 설정 (기본값: 영상 제목)
    let folderName = options.folderName || videoInfo.title;

    // 예약어를 현재 날짜/시간으로 치환한 폴더명 표시
    const processedFolderName = replacePlaceholders(folderName);
    const safeFolderName = sanitizeFolderName(processedFolderName);

    // 부모 폴더가 지정된 경우 하위 폴더 구조로 생성
    let finalFolderName = safeFolderName;
    if (options.parentFolder) {
      finalFolderName = `${options.parentFolder}/${safeFolderName}`;
    }

    console.log(`\n📁 폴더명: ${finalFolderName}`);
    console.log(`📺 제목: ${videoInfo.title}`);
    console.log(`⏱️  길이: ${Math.floor(videoInfo.duration / 60)}:${(videoInfo.duration % 60).toString().padStart(2, '0')}`);
    console.log(`👁️  조회수: ${videoInfo.view_count?.toLocaleString() || 'N/A'}`);

    // 사용 가능한 포맷들 표시
    // showAvailableFormats(videoInfo.formats);

    // 사용자가 포맷 선택
    let selectedFormat;

    if (options.auto) {
      // 자동 선택 모드
      selectedFormat = 'auto';
      console.log('\n✅ 자동 선택 모드 (최고 품질)');
    } else {
      // 인터랙티브 선택 모드
      selectedFormat = await selectFormat(videoInfo.formats);

      // 선택된 포맷 정보 표시
      if (selectedFormat !== 'auto') {
        const selectedFormatInfo = videoInfo.formats.find(f => f.format_id === selectedFormat);
        if (selectedFormatInfo) {
          const size = selectedFormatInfo.filesize ? Math.round(selectedFormatInfo.filesize / 1024 / 1024) + 'MB' : 'N/A';
          console.log(`\n✅ 선택된 포맷: ${selectedFormatInfo.height || 'N/A'}p (${selectedFormatInfo.ext}) - ${size}`);
        }
      } else {
        console.log('\n✅ 자동 선택 모드 (최고 품질)');
      }
    }

    // 다운로드 실행
    await downloadVideo(url, videoInfo, finalFolderName, selectedFormat, options);

  } catch (error) {
    console.error(`❌ 오류: ${error.message}`);
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  main();
}

module.exports = { downloadVideo, getVideoInfo, selectBestFormat };