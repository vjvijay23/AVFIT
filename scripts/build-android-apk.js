const { spawnSync } = require('node:child_process');
const path = require('node:path');

const isWindows = process.platform === 'win32';
const gradle = path.join(__dirname, '..', 'android', isWindows ? 'gradlew.bat' : 'gradlew');
const result = spawnSync(gradle, ['assembleRelease', ...process.argv.slice(2)], {
  cwd: path.join(__dirname, '..', 'android'),
  stdio: 'inherit',
  shell: isWindows,
});

if (result.error) {
  console.error(`Could not start the Android build: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
