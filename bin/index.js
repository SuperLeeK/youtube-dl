#!/usr/bin/env node

const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const createLogger = require('progress-estimator');
const logger = createLogger({
  spinner: {
    interval: 80,
    frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  }
});

// 사용법을 출력하는 함수
function showUsage() {
  console.log(`
YouTube 다운로더 (최고 화질)

사용법:
  youtube <YouTube_URL> [옵션]

옵션:
  --desc, --description   설명 파일 저장
  --json                 JSON 정보 파일 저장
  --parent-folder        상위 폴더 경로 지정 (기본값: Z:\\media)
  --folder-name          폴더명 지정 (기본값: 동영상 제목)
  --output-dir           출력 폴더 직접 지정
  --filename             파일명 지정 (확장자 제외)
  -h, --help            도움말 표시

예시:
  youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ          # 기본 다운로드
  youtube dQw4w9WgXcQ --desc                                   # ID로 다운로드 + 설명 파일
  youtube https://youtu.be/dQw4w9WgXcQ --parent-folder "D:\\Videos"  # 상위 폴더 지정
  youtube dQw4w9WgXcQ --folder-name "MyVideo_{date}"          # 날짜가 포함된 폴더명
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
async function downloadVideo(url, videoInfo, options = {}) {
  try {
    // 경로 설정
    const safeTitle = minimalSanitizeFilename(videoInfo.title);
    let outputDir;
    let filename;

    if (options.outputDir) {
      // 출력 폴더를 직접 지정한 경우
      outputDir = options.outputDir;
      filename = options.filename || safeTitle;
    } else {
      // 기본 미디어 폴더
      const mediaFolder = "Z:\\media";
      
      // 부모 폴더 설정 (media 하위 폴더)
      // parent-folder 또는 parentFolder 둘 다 허용
      const parentFolder = options['parent-folder'] || options.parentFolder || '';
      
      // 최종 경로: Z:\media\[parent-folder]\[video-title]
      outputDir = parentFolder 
        ? path.join(mediaFolder, parentFolder, safeTitle)
        : path.join(mediaFolder, safeTitle);
      
      filename = options.filename || safeTitle;
    }

    // 출력 폴더 생성
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`\n📂 저장 경로: ${outputDir}`);

    // 비디오 다운로드 옵션
    const videoOptions = {
      noPlaylist: true,
      format: '315+140/bestvideo+bestaudio/best',
      mergeOutputFormat: 'mp4',
      writeThumbnail: true,
      writeDescription: options.description,
      writeInfoJson: options.json,
      output: path.join(outputDir, `${filename}.%(ext)s`)
    };

    // 비디오 다운로드
    console.log('\n📹 비디오 다운로드 중...');
    console.log('선택된 포맷: 2160p60 VP9 (최고 품질)');
    const videoPromise = youtubedl(url, videoOptions);
    await logger(videoPromise, `다운로드 중: ${videoInfo.title}`);

    // 오디오 다운로드 옵션
    const audioOptions = {
      noPlaylist: true,
      format: 'bestaudio',
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: '0',
      output: path.join(outputDir, `${filename}.%(ext)s`)
    };

    // 오디오 다운로드
    console.log('\n🎵 오디오 다운로드 중...');
    try {
      const audioPromise = youtubedl(url, audioOptions);
      await logger(audioPromise, `오디오 다운로드 중: ${videoInfo.title}`);
    } catch (error) {
      console.log('\n⚠️ 오디오 다운로드 실패. 다시 시도합니다...');
      const backupAudioOptions = {
        ...audioOptions,
        format: 'bestaudio/best'
      };
      const audioPromise = youtubedl(url, backupAudioOptions);
      await logger(audioPromise, `오디오 다운로드 재시도 중: ${videoInfo.title}`);
    }

    console.log(`\n✅ 다운로드 완료! (📁 ${outputDir})`);
  } catch (error) {
    throw new Error(`다운로드 실패: ${error.message}`);
  }
}

// 메인 함수
async function main() {
  const args = process.argv.slice(2);

  // 도움말 표시
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showUsage();
    return;
  }

  // 메인 함수의 옵션 파싱 부분
  const options = {
    description: args.includes('--desc') || args.includes('--description'),
    json: args.includes('--json')
  };

  // 옵션 값이 있는 인자들 파싱
  const optionsMap = {
    '--parent-folder': 'parent-folder',  // 대시 형식 유지
    '--folder-name': 'folder-name',
    '--output-dir': 'outputDir',
    '--filename': 'filename'
  };

  Object.entries(optionsMap).forEach(([flag, optionName]) => {
    const index = args.indexOf(flag);
    if (index !== -1 && index + 1 < args.length && !args[index + 1].startsWith('--')) {
      options[optionName] = args[index + 1];
    }
  });

  // URL 찾기 (옵션과 옵션값이 아닌 인자)
  let url = args.find((arg, index) => {
    // 옵션이 아니고
    if (arg.startsWith('--')) return false;
    
    // 이전 인자가 옵션이 아닌 경우만
    if (index > 0 && args[index - 1].startsWith('--')) return false;
    
    return true;
  });

  if (!url) {
    console.error('❌ YouTube URL 또는 ID를 입력해주세요.');
    showUsage();
    return;
  }

  // YouTube ID만 입력된 경우 전체 URL로 변환
  if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
    const youtubeIdPattern = /^[a-zA-Z0-9_-]{11}$/;
    if (youtubeIdPattern.test(url)) {
      url = `https://www.youtube.com/watch?v=${url}`;
      console.log(`🔗 YouTube ID를 URL로 변환: ${url}`);
    } else {
      console.error('❌ 유효한 YouTube URL 또는 ID가 아닙니다.');
      console.log('YouTube URL 예시: https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      console.log('YouTube ID 예시: dQw4w9WgXcQ');
      return;
    }
  }

  try {
    // 동영상 정보 가져오기
    console.log('📹 동영상 정보를 가져오는 중...');
    const videoInfo = await getVideoInfo(url);

    console.log(`\n📺 제목: ${videoInfo.title}`);
    console.log(`⏱️  길이: ${Math.floor(videoInfo.duration / 60)}:${(videoInfo.duration % 60).toString().padStart(2, '0')}`);
    console.log(`👁️  조회수: ${videoInfo.view_count?.toLocaleString() || 'N/A'}`);
    
    // 저장될 파일 정보 표시
    console.log('\n📦 저장될 파일:');
    console.log('- 📹 비디오 (MP4)');
    console.log('- 🎵 오디오 (MP3)');
    console.log('- 🖼️ 썸네일');
    if (options.description) console.log('- 📝 설명 파일');
    if (options.json) console.log('- 📋 JSON 정보');

    // 다운로드 실행
    await downloadVideo(url, videoInfo, options);

  } catch (error) {
    console.error(`❌ 오류: ${error.message}`);
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  main();
}

module.exports = { downloadVideo, getVideoInfo };