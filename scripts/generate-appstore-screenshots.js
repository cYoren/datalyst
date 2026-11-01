// This script intentionally remains CommonJS because it is executed directly by Node.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require('playwright');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';
const OUT = process.env.OUT_DIR || '/tmp/datalyst_appstore_screenshots';
const today = new Date().toISOString().slice(0, 10);
const entryDateIso = `${today}T12:00:00.000Z`;

function ensure(dir) { fs.mkdirSync(dir, { recursive: true }); }

async function installMocks(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('datalyst_cookie_notice_v1', 'acknowledged');
    window.localStorage.setItem('datalyst-theme', 'DARK');
    window.localStorage.setItem('datalyst_insight_celebrated', '1');
    window.localStorage.setItem('datalyst_seen_insight_count', '1');
    window.sessionStorage.setItem('datalyst-activity-calendar-hint-dismissed', '1');
  });

  await page.route('**/api/user', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: { email: 'alex@datalyst.one', name: 'Alex', user_metadata: { name: 'Alex' } } }),
  }));

  await page.route('**/api/dashboard', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      habits: [
        { id: 'sleep', name: 'Sleep', description: 'Sleep quality and duration', icon: '😴', habitColor: '#0ea5a4', schedule: '{}', subvariables: [{ id: 'sleep_quality', name: 'Sleep quality', type: 'BOOLEAN' }], entries: [{ id: 'e1' }] },
        { id: 'focus', name: 'Deep work', description: 'Focused work blocks', icon: '🧠', habitColor: '#6366f1', schedule: '{}', subvariables: [{ id: 'focus_minutes', name: 'Focus minutes', type: 'NUMERIC', unit: 'min' }], entries: [{ id: 'e2' }] },
      ],
      stats: { weeklyCompletion: 82, dailyProgress: { percentage: 67, completed: 2, total: 3 }, weeklySummary: { daysActive: 6, totalEntries: 18, avgEntriesPerDay: 3.0 }, totalLoggingDays: 31 },
      insights: { correlations: [{ id: 'c1', text: 'Sleep quality tracks next-day focus with r = 0.62', variable1: { habit: 'Sleep' }, variable2: { habit: 'Deep work' } }], generatedAt: new Date().toISOString(), cached: true },
      user: { email: 'alex@datalyst.one', name: 'Alex', user_metadata: { name: 'Alex' } },
    }),
  }));

  await page.route('**/api/dashboard/today', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      variables: [
        { id: 'sleep_quality', name: 'Sleep quality', type: 'BOOLEAN', habitId: 'sleep', habitName: 'Sleep', habitIcon: '😴', habitColor: '#0ea5a4', timeBlock: 'MORNING', rank: 0 },
        { id: 'focus_minutes', name: 'Focus minutes', type: 'NUMERIC', unit: 'min', habitId: 'focus', habitName: 'Deep work', habitIcon: '🧠', habitColor: '#6366f1', timeBlock: 'AFTERNOON', rank: 1, todayEntry: { entryId: 'entry_focus', subvariableEntryId: 'sub_focus', numericValue: 90, rawValue: '90' } },
      ],
      logged: 2,
      total: 3,
      percentage: 67,
    }),
  }));

  await page.route('**/api/dashboard/activity?*', route => {
    const days = Array.from({ length: 84 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (83 - index));
      const intensity = (index % 7 === 0) ? 4 : (index % 5 === 0 ? 3 : (index % 3 === 0 ? 2 : 1));
      return { date: date.toISOString().slice(0, 10), completedTrackers: intensity, scheduledTrackers: 4, completionPct: intensity * 25, entriesCount: intensity, intensity };
    });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ days }) });
  });

  await page.route('**/api/experiments/active-assignment', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ experiment: { id: 'exp1', name: 'Caffeine timing protocol' }, assignment: { condition: 'No caffeine after 14:00' } }),
  }));

  await page.route('**/api/data', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      habits: [
        { id: 'sleep', name: 'Sleep', icon: '😴', color: '#0ea5a4', subvariables: [{ id: 'sleep_quality', name: 'Sleep quality', type: 'BOOLEAN', unit: null, order: 0 }] },
        { id: 'focus', name: 'Deep work', icon: '🧠', color: '#6366f1', subvariables: [{ id: 'focus_minutes', name: 'Focus minutes', type: 'NUMERIC', unit: 'min', order: 0 }] },
      ],
      entries: [
        { id: 'entry1', habitId: 'sleep', logicalDate: entryDateIso, note: 'Felt well-rested', subvariableEntries: [{ subvariableId: 'sleep_quality', numericValue: 1, rawValue: 'Yes' }] },
        { id: 'entry2', habitId: 'focus', logicalDate: entryDateIso, note: 'Two uninterrupted blocks', subvariableEntries: [{ subvariableId: 'focus_minutes', numericValue: 115, rawValue: '115' }] },
      ],
    }),
  }));

  await page.route('**/api/experiments**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ experiments: [
      { id: 'trial1', name: 'Sleep consistency trial', status: 'ACTIVE', independentVariable: 'Bedtime before 23:00', dependentVariable: 'Focus score', startDate: today },
      { id: 'trial2', name: 'Morning walk protocol', status: 'COMPLETED', independentVariable: '20 minute walk', dependentVariable: 'Mood', startDate: today },
    ] }),
  }));
}

async function captureDevice(browser, name, viewport, deviceScaleFactor) {
  const outDir = path.join(OUT, name);
  ensure(outDir);
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    extraHTTPHeaders: { 'x-e2e-bypass-auth': '1' },
  });
  const page = await context.newPage();
  await installMocks(page);
  const shots = [
    ['dashboard', '/dashboard', null],
    ['data', '/data', null],
    ['checkin', '/dashboard', async () => {
      await page.evaluate(() => document.querySelector('#daily-checkin')?.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(800);
    }],
  ];
  let idx = 1;
  for (const [label, route, action] of shots) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    if (typeof action === 'function') await action();
    await page.screenshot({ path: path.join(outDir, `${idx}-${label}.png`), fullPage: false });
    idx++;
  }
  await context.close();
}

(async () => {
  ensure(OUT);
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/root/.cache/ms-playwright/chromium-1223/chrome-linux/chrome';
  const browser = await chromium.launch({ headless: true, executablePath });
  await captureDevice(browser, 'iphone65', { width: 414, height: 896 }, 3);
  await captureDevice(browser, 'ipad129', { width: 1024, height: 1366 }, 2);
  await browser.close();
  console.log(`screenshots written to ${OUT}`);
})();
