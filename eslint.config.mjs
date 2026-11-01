import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".claude/worktrees/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    ".vercel/**",
    "out/**",
    "build/**",
    ".open-next/**",
    ".wrangler/**",
    "coverage/**",
    "test-results/**",
    "www/**",
    "next-env.d.ts",
    "android/**/build/**",
    "ios/**/DerivedData/**",
    "ios/App/App/public/**",
    "android/app/src/main/assets/public/**",
    ".open-next/**",
    ".wrangler/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
