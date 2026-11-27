#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const androidDir = path.join(root, 'android');
const manifestPath = path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');
const resDir = path.join(androidDir, 'app', 'src', 'main', 'res');
const buildGradlePath = path.join(androidDir, 'app', 'build.gradle');

if (!fs.existsSync(manifestPath)) {
  console.error('AndroidManifest.xml not found. Run "npx cap add android" first.');
  process.exit(1);
}

// 1. Enable cleartext traffic so Android Local Engine (http://127.0.0.1:3847) works inside WebView
let manifest = fs.readFileSync(manifestPath, 'utf8');
if (!manifest.includes('android:usesCleartextTraffic')) {
  manifest = manifest.replace(
    '<application',
    '<application\n        android:usesCleartextTraffic="true"'
  );
  fs.writeFileSync(manifestPath, manifest, 'utf8');
  console.log('Enabled android:usesCleartextTraffic="true" in AndroidManifest.xml');
}

// 2. Copy VeloSave PNG launcher icons into Android mipmap directories
const icon192 = path.join(root, 'public', 'pwa-192x192.png');
const icon512 = path.join(root, 'public', 'pwa-512x512.png');
const iconMaskable = path.join(root, 'public', 'pwa-maskable-512x512.png');

const mipmapTargets = [
  { dir: 'mipmap-mdpi', src: icon192 },
  { dir: 'mipmap-hdpi', src: icon192 },
  { dir: 'mipmap-xhdpi', src: icon192 },
  { dir: 'mipmap-xxhdpi', src: icon512 },
  { dir: 'mipmap-xxxhdpi', src: icon512 },
];

for (const target of mipmapTargets) {
  const destDir = path.join(resDir, target.dir);
  if (fs.existsSync(destDir) && fs.existsSync(target.src)) {
    fs.copyFileSync(target.src, path.join(destDir, 'ic_launcher.png'));
    fs.copyFileSync(
      fs.existsSync(iconMaskable) ? iconMaskable : target.src,
      path.join(destDir, 'ic_launcher_round.png')
    );
    fs.copyFileSync(
      fs.existsSync(iconMaskable) ? iconMaskable : target.src,
      path.join(destDir, 'ic_launcher_foreground.png')
    );
  }
}
console.log('Copied VeloSave launcher icons into Android mipmap directories');

// 3. Apply CI build number if running on GitHub Actions
const runNumber = Number(process.env.GITHUB_RUN_NUMBER || 0);
if (runNumber > 0 && fs.existsSync(buildGradlePath)) {
  let gradle = fs.readFileSync(buildGradlePath, 'utf8');
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${runNumber}`);
  if (process.env.APK_VERSION_NAME) {
    gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${process.env.APK_VERSION_NAME}"`);
  }
  fs.writeFileSync(buildGradlePath, gradle, 'utf8');
  console.log(`Updated Android versionCode to ${runNumber}`);
}
