import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// AGP 9 rejects the legacy default because it disables optimization. These
// pinned Capacitor plugins still reference it even though their own minify is
// disabled. The app's release optimizer handles the final merged program.
const root = new URL('../', import.meta.url);
for (const name of ['apple-sign-in', 'in-app-review']) {
  const file = new URL(`node_modules/@capacitor-community/${name}/android/build.gradle`, root);
  if (!existsSync(file)) throw new Error(`Install the pinned ${name} dependency before building Android`);
  const before = readFileSync(file, 'utf8');
  const after = before.replaceAll("getDefaultProguardFile('proguard-android.txt')",
    "getDefaultProguardFile('proguard-android-optimize.txt')");
  if (after !== before) writeFileSync(file, after);
}
