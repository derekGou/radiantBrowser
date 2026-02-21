const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'resources');
const platform = process.platform;

fs.mkdirSync(outputDir, { recursive: true });

if (platform === 'darwin') {
  const sourcePath = path.join(rootDir, 'src', 'scripts', 'script.swift');
  const outputPath = path.join(outputDir, 'keytap');

  if (!fs.existsSync(sourcePath)) {
    console.error(`Keytap source not found at ${sourcePath}`);
    process.exit(1);
  }

  const result = spawnSync('xcrun', ['swiftc', sourcePath, '-O', '-o', outputPath], {
    stdio: 'inherit',
  });

  if (result.error) {
    console.error('Failed to run swiftc:', result.error.message);
    process.exit(1);
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }

  console.log(`Keytap binary built at ${outputPath}`);
} else if (platform === 'win32') {
  const sourcePath = path.join(rootDir, 'src', 'scripts', 'keytap.cpp');
  const outputPath = path.join(outputDir, 'keytap.exe');

  if (!fs.existsSync(sourcePath)) {
    console.error(`Keytap source not found at ${sourcePath}`);
    process.exit(1);
  }

  // Try MSVC cl.exe first, then fall back to other compilers
  const result = spawnSync('cl.exe', [sourcePath, `/Fe${outputPath}`, '/O2', '/W4'], {
    stdio: 'inherit',
    shell: true,
  });

  if (result.error || (typeof result.status === 'number' && result.status !== 0)) {
    console.warn('MSVC compilation failed or not available, attempting with g++ or clang++');
    
    const gppResult = spawnSync('g++', [sourcePath, '-O2', '-o', outputPath, '-luser32'], {
      stdio: 'inherit',
    });

    if (gppResult.error || (typeof gppResult.status === 'number' && gppResult.status !== 0)) {
      console.error('Failed to compile keytap with either cl.exe or g++');
      process.exit(1);
    }
  }

  console.log(`Keytap binary built at ${outputPath}`);
} else {
  console.log('Keytap build skipped: unsupported platform');
  process.exit(0);
}
