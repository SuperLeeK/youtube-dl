#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

async function processLine(line, options = {}) {
  return new Promise((resolve, reject) => {
    // 빈 줄 무시
    if (!line.trim()) {
      resolve();
      return;
    }

    // 명령어 구성 - 따옴표 처리 주의
    let command = `youtube "${line.trim()}"`;  // URL을 따옴표로 감싸기
    
    if (options.parentFolder) {
      // Windows 경로 구분자로 변환하고 따옴표로 감싸기
      const normalizedPath = options.parentFolder.replace(/\//g, '\\');
      command += ` --parent-folder "${normalizedPath}"`;
    }

    console.log(`\n🎬 실행 명령어: ${command}`);
    console.log(`📂 예상 저장 위치: media/${options.parentFolder}`);
    
    const process = spawn(command, {
      stdio: 'inherit',
      shell: true
    });

    process.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ 다운로드 완료: ${line.trim()}\n\n----------------------------------`);
        resolve();
      } else {
        console.error(`❌ 다운로드 실패 (${code}): ${line.trim()}`);
        resolve(); // 실패해도 계속 진행
      }
    });

    process.on('error', (err) => {
      console.error(`❌ 실행 오류: ${err.message}`);
      resolve(); // 오류가 발생해도 계속 진행
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  
  // 입력 파일 경로
  const inputFile = args[0] || 'ise.txt';
  
  // 파일 존재 확인
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ 파일을 찾을 수 없습니다: ${inputFile}`);
    process.exit(1);
  }

  // 옵션 설정 (두 번째 인자가 있으면 그것을 부모 폴더로 사용)
  const options = {
    parentFolder: args[1] || 'ISEGYE_IDOL/INE'  // 기본값에 하위 폴더 포함
  };

  // 파일 읽기 스트림 생성
  const fileStream = fs.createReadStream(inputFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log(`📋 ${inputFile} 파일에서 URL을 읽어오는 중...`);
  console.log(`📁 저장 경로: media/${options.parentFolder}`);
  
  let lineCount = 0;
  let successCount = 0;
  let failCount = 0;

  // 각 줄 처리
  for await (const line of rl) {
    if (line.trim()) {
      lineCount++;
      try {
        await processLine(line, options);
        successCount++;
      } catch (error) {
        console.error(`❌ 처리 실패: ${error.message}`);
        failCount++;
      }
    }
  }

  // 결과 출력
  console.log('\n📊 다운로드 결과:');
  console.log(`총 URL 수: ${lineCount}`);
  console.log(`성공: ${successCount}`);
  console.log(`실패: ${failCount}`);
}

// 스크립트 실행
if (require.main === module) {
  main().catch(error => {
    console.error(`❌ 오류 발생: ${error.message}`);
    process.exit(1);
  });
}