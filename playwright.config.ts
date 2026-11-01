import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT || 3005);

export default defineConfig({
    testDir: "./e2e",
    timeout: 60_000,
    expect: {
        timeout: 10_000,
    },
    use: {
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
        },
        baseURL: `http://localhost:${port}`,
        trace: "on-first-retry",
        extraHTTPHeaders: {
            "x-e2e-bypass-auth": "1",
        },
    },
    projects: [
        {
            name: "mobile-chromium",
            use: {
                ...devices["iPhone 13"],
                browserName: "chromium",
            },
        },
    ],
    webServer: {
        command: `E2E_BYPASS_AUTH=1 npx next dev -p ${port}`,
        url: `http://localhost:${port}`,
        reuseExistingServer: true,
        timeout: 120_000,
    },
});
