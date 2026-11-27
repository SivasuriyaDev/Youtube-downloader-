#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const androidDir = path.join(root, 'android');
const appMainDir = path.join(androidDir, 'app', 'src', 'main');
const manifestPath = path.join(appMainDir, 'AndroidManifest.xml');
const resDir = path.join(appMainDir, 'res');
const buildGradlePath = path.join(androidDir, 'app', 'build.gradle');
const javaPackageDir = path.join(appMainDir, 'java', 'com', 'velosave', 'downloader');
const pluginSourcePath = path.join(root, 'scripts', 'android', 'VeloSaveEnginePlugin.java');

if (!fs.existsSync(manifestPath)) {
  console.error('AndroidManifest.xml not found. Run "npx cap add android" first.');
  process.exit(1);
}

// 1. Configure AndroidManifest.xml (cleartext localhost fallback, legacy storage permission <= API 28, Share intent filter)
let manifest = fs.readFileSync(manifestPath, 'utf8');
if (!manifest.includes('android:usesCleartextTraffic')) {
  manifest = manifest.replace(
    '<application',
    '<application\n        android:usesCleartextTraffic="true"'
  );
  console.log('Enabled android:usesCleartextTraffic="true" in AndroidManifest.xml');
}

if (!manifest.includes('android.permission.WRITE_EXTERNAL_STORAGE')) {
  manifest = manifest.replace(
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />'
  );
  console.log('Added WRITE_EXTERNAL_STORAGE (maxSdkVersion 28) permission to AndroidManifest.xml');
}

if (!manifest.includes('android.intent.action.SEND')) {
  manifest = manifest.replace(
    '</intent-filter>',
    `</intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>`
  );
  console.log('Added Android Share Sheet intent-filter to AndroidManifest.xml');
}

fs.writeFileSync(manifestPath, manifest, 'utf8');

// 2. Copy native VeloSaveEnginePlugin.java (inbuilt yt-dlp + FFmpeg Capacitor plugin) and register in MainActivity.java
if (!fs.existsSync(pluginSourcePath)) {
  console.error('Missing plugin template at scripts/android/VeloSaveEnginePlugin.java');
  process.exit(1);
}

fs.mkdirSync(javaPackageDir, { recursive: true });
fs.copyFileSync(pluginSourcePath, path.join(javaPackageDir, 'VeloSaveEnginePlugin.java'));
console.log('Installed VeloSaveEnginePlugin.java into Android app package');

const mainActivityPath = path.join(javaPackageDir, 'MainActivity.java');
const mainActivityJava = `package com.velosave.downloader;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VeloSaveEnginePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`;
fs.writeFileSync(mainActivityPath, mainActivityJava, 'utf8');
console.log('Registered VeloSaveEnginePlugin in MainActivity.java');

// 3. Configure android/app/build.gradle with inbuilt yt-dlp + FFmpeg dependencies, ABI filters, and jniLibs extraction
if (fs.existsSync(buildGradlePath)) {
  let gradle = fs.readFileSync(buildGradlePath, 'utf8');

  if (!gradle.includes('abiFilters')) {
    gradle = gradle.replace(
      /defaultConfig\s*\{/,
      `defaultConfig {\n        ndk {\n            abiFilters 'armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'\n        }`
    );
  }

  if (!gradle.includes('useLegacyPackaging')) {
    gradle = gradle.replace(
      /buildTypes\s*\{/,
      `packaging {\n        jniLibs {\n            useLegacyPackaging = true\n        }\n    }\n    buildTypes {`
    );
  }

  if (!gradle.includes('io.github.junkfood02.youtubedl-android:library')) {
    gradle = gradle.replace(
      /dependencies\s*\{/,
      `dependencies {\n    implementation 'io.github.junkfood02.youtubedl-android:library:0.18.1'\n    implementation 'io.github.junkfood02.youtubedl-android:ffmpeg:0.18.1'`
    );
  }

  // Apply CI build number if running on GitHub Actions
  const runNumber = Number(process.env.GITHUB_RUN_NUMBER || 0);
  if (runNumber > 0) {
    gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${runNumber}`);
    if (process.env.APK_VERSION_NAME) {
      gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${process.env.APK_VERSION_NAME}"`);
    }
    console.log(`Updated Android versionCode to ${runNumber}`);
  }

  fs.writeFileSync(buildGradlePath, gradle, 'utf8');
  console.log('Configured build.gradle with inbuilt yt-dlp + FFmpeg libraries');
}

// 4. Copy VeloSave PNG launcher icons into Android mipmap directories
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
