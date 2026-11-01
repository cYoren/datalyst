import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const version = JSON.parse(read('native-version.json'));
assert.match(version.version, /^\d+\.\d+\.\d+$/);
assert.ok(Number.isSafeInteger(version.build) && version.build > 0);
const iosProjects = ['ios/App.xcodeproj/project.pbxproj', 'ios/App/App.xcodeproj/project.pbxproj'];
if (process.argv.includes('--write-version')) {
    for (const path of iosProjects) {
        const updated = read(path).replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version.version};`)
            .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${version.build};`);
        writeFileSync(new URL(path, root), updated);
    }
    const path = 'android/app/build.gradle';
    writeFileSync(new URL(path, root), read(path).replace(/versionCode \d+/, `versionCode ${version.build}`)
        .replace(/versionName "[^"]+"/, `versionName "${version.version}"`));
}
for (const path of iosProjects) {
    const project = read(path);
    const versions = [...project.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(m => m[1]);
    const builds = [...project.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map(m => Number(m[1]));
    assert.ok(versions.length && versions.every(v => v === version.version), `${path}: version mismatch`);
    assert.ok(builds.length && builds.every(v => v === version.build), `${path}: build mismatch`);
}
const android = read('android/app/build.gradle');
assert.ok(android.includes(`versionCode ${version.build}`) && android.includes(`versionName "${version.version}"`));
assert.ok(android.includes('applicationId "com.datalyst.app"'));
assert.ok(!android.includes('signingConfigs.debug'), 'Release must not fall back to debug signing');
const project = read(iosProjects[0]);
for (const expected of ['TodayWidget.swift in Sources', 'BridgeViewController.swift in Sources', 'DatalystWidgetPlugin.swift in Sources', 'com.datalyst.app.TodayWidget', 'com.apple.HealthKit']) {
    assert.ok(project.includes(expected), `Canonical widget-enabled iOS project missing ${expected}`);
}
const appEntitlements = read('ios/App/App/App.entitlements');
assert.ok(appEntitlements.includes('com.apple.developer.healthkit'));
for (const path of ['ios/App/App/App.entitlements', 'ios/App/TodayWidget/TodayWidget.entitlements']) {
    assert.ok(read(path).includes('group.com.datalyst.app'), `${path}: missing App Group`);
}
assert.ok(read('ios/App/App/Info.plist').includes('NSHealthShareUsageDescription'));
const urls = ['android/app/src/main/assets/capacitor.config.json', 'ios/App/App/capacitor.config.json'].map(path => {
    const config = JSON.parse(read(path));
    assert.equal(config.appId, 'com.datalyst.app');
    assert.equal(config.server.cleartext, false);
    assert.equal(config.server.url, 'https://www.datalyst.one/dashboard', `${path}: noncanonical server URL`);
    return config.server.url;
});
assert.ok(read('capacitor.config.ts').includes(urls[0]));
assert.equal(JSON.parse(read('vercel.json')).git.deploymentEnabled.main, false, 'Review deployment hold before changing native release plan');
console.log(`Native configuration passes: ${version.version} (${version.build}), app/widget versions aligned, canonical HTTPS server, widget and HealthKit declarations, production hold retained.`);
console.log('Build number is validation-only and has NOT been verified across both stores. No signed release/upload is authorized.');
