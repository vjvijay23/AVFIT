const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const isWindows = process.platform === 'win32';
const androidDir = path.join(__dirname, '..', 'android');
const gradle = path.join(androidDir, isWindows ? 'gradlew.bat' : 'gradlew');
const localBuildInit = path.join(androidDir, '.codex-build', 'redirect-build.init.gradle');
const buildArgs = ['--no-daemon'];
// In restricted/synced workspaces, native dependencies may be read-only. Use
// the workspace-local Gradle redirection when the developer environment has it.
if (fs.existsSync(localBuildInit)) buildArgs.push('--init-script', localBuildInit);
buildArgs.push('assembleRelease', ...process.argv.slice(2));
// A stale Gradle daemon can retain an invalid Android SDK/NDK discovery state
// on Windows. A single-use daemon performs a fresh SDK scan for each build.
const result = spawnSync(gradle, buildArgs, {
  cwd: androidDir,
  stdio: 'inherit',
  shell: isWindows,
});

if (result.error) {
  console.error(`Could not start the Android build: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
