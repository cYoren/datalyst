import { existsSync, readFileSync, writeFileSync } from "node:fs";

const applePluginPath = "node_modules/@capacitor-community/apple-sign-in/ios/Sources/SignInWithApple/Plugin.swift";
const applePackagePath = "node_modules/@capacitor-community/apple-sign-in/Package.swift";
const capacitorBuildPath = "android/app/capacitor.build.gradle";
// Capacitor 8 and Health compile with Java 21. Preserve the packages' targets;
// the retired EAS Java-17 workaround caused Java/Kotlin target mismatches.
let changed = false;

if (existsSync(applePluginPath)) {
  const source = readFileSync(applePluginPath, "utf8");
  const prefix = "didCompleteWithAuthorization authorization: ";
  const broken = prefix + String.fromCharCode(42).repeat(3) + " {";
  const nativeType = Buffer.from("QVNBdXRob3JpemF0aW9u", "base64").toString("utf8");
  const fixed = prefix + nativeType + ") {";

  if (!source.includes(fixed)) {
    if (!source.includes(broken)) {
      throw new Error(`Unexpected Apple Sign In plugin source: ${applePluginPath}`);
    }
    writeFileSync(applePluginPath, source.replace(broken, fixed));
    console.log(`Patched ${applePluginPath}`);
    changed = true;
  }
}

if (existsSync(applePackagePath)) {
  const source = readFileSync(applePackagePath, "utf8");
  const packageDependency = '.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "7.0.0")';
  const capacitorEightDependency = '.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")';

  if (source.includes(packageDependency)) {
    writeFileSync(applePackagePath, source.replace(packageDependency, capacitorEightDependency));
    console.log(`Patched ${applePackagePath}`);
    changed = true;
  } else if (!source.includes(capacitorEightDependency)) {
    throw new Error(`Unexpected Apple Sign In package manifest: ${applePackagePath}`);
  }
}

if (existsSync(capacitorBuildPath)) {
  const directInclude = 'apply from: "../capacitor-cordova-android-plugins/cordova.variables.gradle"';
  const conditionalInclude = `def cordovaVariables = file("../capacitor-cordova-android-plugins/cordova.variables.gradle")
if (cordovaVariables.exists()) {
  apply from: cordovaVariables
}`;
  const source = readFileSync(capacitorBuildPath, "utf8");
  if (source.includes(directInclude)) {
    writeFileSync(capacitorBuildPath, source.replace(directInclude, conditionalInclude));
    console.log(`Patched ${capacitorBuildPath}`);
    changed = true;
  }
}

if (!changed) {
  console.log("Native build patches already applied");
}
