const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-background-actions',
  'android',
  'src',
  'main',
  'java',
  'com',
  'asterinet',
  'react',
  'bgactions',
  'RNBackgroundActionsTask.java',
);

if (!fs.existsSync(sourcePath)) {
  // The dependency may not be installed when a package manager is resolving it.
  process.exit(0);
}

const source = fs.readFileSync(sourcePath, 'utf8');
const api35Timeout = [
  '    @Override',
  '    public void onTimeout(int startId, int fgsType) {',
  '        super.onTimeout(startId, fgsType);',
  '        stopSelf(startId);',
  '    }',
  '',
].join('\n');

if (source.includes(api35Timeout)) {
  // Expo SDK 51 compiles against API 34. Keep its supported timeout callback;
  // the two-argument overload is only available when compiling against API 35+.
  fs.writeFileSync(sourcePath, source.replace(api35Timeout, ''), 'utf8');
}

const gradlePath = path.join(__dirname, '..', 'node_modules', 'react-native-background-actions', 'android', 'build.gradle');
if (fs.existsSync(gradlePath)) {
  const gradle = fs.readFileSync(gradlePath, 'utf8');
  const coreDependency = "    implementation 'androidx.core:core:1.13.1'";
  if (!gradle.includes(coreDependency)) {
    fs.writeFileSync(gradlePath, gradle.replace('dependencies {', `dependencies {\n${coreDependency}`), 'utf8');
  }
}
