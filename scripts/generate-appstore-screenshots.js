// Store screenshots for the current App Store and Play sizes.
//
//   E2E_BYPASS_AUTH=1 npx next start -p 3100
//   node scripts/generate-appstore-screenshots.js
//
// Writes captioned PNGs to store-assets/screenshots and links the same files
// into the fastlane metadata folders. Nothing is uploaded.
//
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require('@playwright/test');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
const ROOT = path.join(__dirname, '..');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';
const OUT = process.env.OUT_DIR || path.join(ROOT, 'store-assets/screenshots');

const DEVICES = [
  { id: 'iphone-6.9', viewport: { width: 440, height: 956 }, scale: 3, outW: 1320, outH: 2868 },
  { id: 'iphone-6.5', viewport: { width: 414, height: 896 }, scale: 3, outW: 1242, outH: 2688 },
  { id: 'ipad-13', viewport: { width: 1032, height: 1376 }, scale: 2, outW: 2064, outH: 2752 },
  { id: 'play-phone', viewport: { width: 360, height: 640 }, scale: 3, outW: 1080, outH: 1920 },
];

const LOCALES = {
  'en-US': {
    eyebrow: 'Symptom and habit tracker',
    featureTitle: 'Datalyst',
    featureBody: 'Log symptoms and habits and discover what affects your health.',
    shots: {
      symptom: ['Log a symptom', 'Rate migraine, pain, mood or energy.'],
      habit: ['Log a habit', 'Sleep, coffee, a walk. The things you do.'],
      insights: ['See what affects your health', 'How what you do lines up with how you feel.'],
      history: ['Your history, day by day', 'Symptoms and habits in one place.'],
      experiment: ['Test what you suspect', 'Turn a pattern into a personal experiment.'],
    },
  },
  // Captions only. The app UI has no pt-BR strings, so these shots stay in English under the Portuguese band.
  'pt-BR': {
    eyebrow: 'Sintomas e hábitos',
    featureTitle: 'Datalyst',
    featureBody: 'Registre sintomas e hábitos e descubra o que afeta sua saúde.',
    shots: {
      symptom: ['Registre um sintoma', 'Enxaqueca, dor, humor ou energia.'],
      habit: ['Registre um hábito', 'Sono, café, uma caminhada.'],
      insights: ['Veja o que afeta sua saúde', 'Como o que você faz se liga ao que você sente.'],
      history: ['Seu histórico, dia a dia', 'Sintomas e hábitos num só lugar.'],
      experiment: ['Teste o que você suspeita', 'Transforme um padrão num experimento pessoal.'],
    },
  },
};

const SHOTS = [
  { id: '01-symptom', key: 'symptom', route: '/dashboard', ready: 'Migraine pain', scroll: 'Migraine pain', scrollBlock: 'start' },
  { id: '02-habit', key: 'habit', route: '/dashboard', ready: 'Sleep hours', scroll: 'Sleep hours', loose: true, scrollBlock: 'start' },
  { id: '03-insights', key: 'insights', route: '/dashboard', ready: 'Strongest signal', scroll: null },
  { id: '04-history', key: 'history', route: '/data', ready: 'Data', scroll: 'chart' },
  { id: '05-experiment', key: 'experiment', route: '/lab', ready: 'No coffee after 2pm', scroll: 'No coffee after 2pm', scrollBlock: 'start' },
];

function ensure(dir) { fs.mkdirSync(dir, { recursive: true }); }

function isoDaysAgo(n) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - n);
  return date.toISOString();
}

function dateDaysAgo(n) {
  return isoDaysAgo(n).slice(0, 10);
}

function buildHistory() {
  const habits = [
    { id: 'migraine', name: 'Migraine', icon: 'brain', color: '#ff8a6b', subvariables: [{ id: 'pain', name: 'Pain', type: 'SCALE_0_10', unit: null, order: 0 }] },
    { id: 'sleep', name: 'Sleep', icon: 'moon', color: '#9d9fff', subvariables: [{ id: 'hours', name: 'Hours', type: 'NUMERIC', unit: 'h', order: 0 }] },
    { id: 'coffee', name: 'Coffee after 2pm', icon: 'coffee', color: '#f5b54a', subvariables: [{ id: 'cups', name: 'Cups', type: 'NUMERIC', unit: 'cups', order: 0 }] },
    { id: 'mood', name: 'Mood', icon: 'smile', color: '#5ed3b5', subvariables: [{ id: 'mood_score', name: 'Mood', type: 'SCALE_0_10', unit: null, order: 0 }] },
    { id: 'walk', name: 'Morning walk', icon: 'steps', color: '#5ed3b5', subvariables: [{ id: 'walked', name: 'Walked', type: 'BOOLEAN', unit: null, order: 0 }] },
  ];
  const entries = [];
  for (let n = 27; n >= 0; n -= 1) {
    const logicalDate = isoDaysAgo(n);
    const cups = n % 3 === 0 ? 2 : (n % 2 === 0 ? 0 : 1);
    const hours = Math.round((8.2 - cups * 0.65 + (n % 4 === 0 ? 0.2 : 0)) * 10) / 10;
    const pain = Math.min(8, 2 + cups * 2 + (n % 5 === 0 ? 1 : 0));
    const mood = Math.max(2, Math.min(9, 8 - Math.round(pain / 2)));
    const walked = n % 2 === 0 ? 1 : 0;
    entries.push(
      { id: `migraine-${n}`, habitId: 'migraine', logicalDate, note: pain >= 6 ? 'Afternoon pain' : '', subvariableEntries: [{ subvariableId: 'pain', numericValue: pain, rawValue: String(pain) }] },
      { id: `sleep-${n}`, habitId: 'sleep', logicalDate, subvariableEntries: [{ subvariableId: 'hours', numericValue: hours, rawValue: String(hours) }] },
      { id: `coffee-${n}`, habitId: 'coffee', logicalDate, subvariableEntries: [{ subvariableId: 'cups', numericValue: cups, rawValue: String(cups) }] },
      { id: `mood-${n}`, habitId: 'mood', logicalDate, subvariableEntries: [{ subvariableId: 'mood_score', numericValue: mood, rawValue: String(mood) }] },
      { id: `walk-${n}`, habitId: 'walk', logicalDate, subvariableEntries: [{ subvariableId: 'walked', numericValue: walked, rawValue: walked ? 'Yes' : 'No' }] },
    );
  }
  return { habits, entries };
}

function dashboardHabits() {
  return [
    { id: 'migraine', name: 'Migraine', description: 'Head pain', icon: 'brain', color: '#ff8a6b', habitColor: '#ff8a6b', schedule: '{}', subvariables: [{ id: 'pain', name: 'Pain', type: 'SCALE_0_10' }], entries: [] },
    { id: 'sleep', name: 'Sleep', description: 'Hours asleep', icon: 'moon', color: '#9d9fff', habitColor: '#9d9fff', schedule: '{}', subvariables: [{ id: 'hours', name: 'Hours', type: 'NUMERIC', unit: 'h' }], entries: [{ id: 'e-sleep' }] },
    { id: 'coffee', name: 'Coffee after 2pm', description: 'Late caffeine', icon: 'coffee', color: '#f5b54a', habitColor: '#f5b54a', schedule: '{}', subvariables: [{ id: 'cups', name: 'Cups', type: 'NUMERIC', unit: 'cups' }], entries: [{ id: 'e-coffee' }] },
    { id: 'mood', name: 'Mood', description: 'How you feel', icon: 'smile', color: '#5ed3b5', habitColor: '#5ed3b5', schedule: '{}', subvariables: [{ id: 'mood_score', name: 'Mood', type: 'SCALE_0_10' }], entries: [] },
    { id: 'walk', name: 'Morning walk', description: 'A short walk', icon: 'steps', color: '#5ed3b5', habitColor: '#5ed3b5', schedule: '{}', subvariables: [{ id: 'walked', name: 'Walked', type: 'BOOLEAN' }], entries: [{ id: 'e-walk' }] },
  ];
}

function todayPayload() {
  return {
    variables: [
      { id: 'hours', name: 'Sleep hours', type: 'NUMERIC', unit: 'h', habitId: 'sleep', habitName: 'Sleep', habitIcon: 'moon', habitColor: '#9d9fff', timeBlock: 'MORNING', rank: 0, todayEntry: { entryId: 'e-sleep', subvariableEntryId: 'sv-sleep', numericValue: 7.5, rawValue: '7.5' } },
      { id: 'walked', name: 'Morning walk', type: 'BOOLEAN', habitId: 'walk', habitName: 'Morning walk', habitIcon: 'steps', habitColor: '#5ed3b5', timeBlock: 'MORNING', rank: 1, todayEntry: { entryId: 'e-walk', subvariableEntryId: 'sv-walk', numericValue: 1, rawValue: 'Yes' } },
      { id: 'cups', name: 'Coffee after 2pm', type: 'NUMERIC', unit: 'cups', habitId: 'coffee', habitName: 'Coffee after 2pm', habitIcon: 'coffee', habitColor: '#f5b54a', timeBlock: 'AFTERNOON', rank: 2, todayEntry: { entryId: 'e-coffee', subvariableEntryId: 'sv-coffee', numericValue: 1, rawValue: '1' } },
      { id: 'pain', name: 'Migraine pain', type: 'SCALE_0_10', habitId: 'migraine', habitName: 'Migraine', habitIcon: 'brain', habitColor: '#ff8a6b', timeBlock: 'EVENING', rank: 3 },
      { id: 'mood_score', name: 'Mood', type: 'SCALE_0_10', habitId: 'mood', habitName: 'Mood', habitIcon: 'smile', habitColor: '#5ed3b5', timeBlock: 'EVENING', rank: 4 },
    ],
    logged: 3,
    total: 5,
    percentage: 60,
  };
}

function activityDays() {
  return Array.from({ length: 84 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (83 - index));
    const intensity = index % 7 === 0 ? 1 : (index % 3 === 0 ? 3 : 2);
    return {
      date: date.toISOString().slice(0, 10),
      completedTrackers: intensity,
      scheduledTrackers: 4,
      completionPct: intensity * 25,
      entriesCount: intensity,
      intensity,
    };
  });
}

const HISTORY = buildHistory();
const EXPERIMENTS = [{
  id: 'exp1',
  name: 'No coffee after 2pm',
  hypothesis: 'Skipping late coffee may improve sleep and ease migraine pain.',
  startDate: dateDaysAgo(6),
  endDate: dateDaysAgo(-10),
  status: 'ACTIVE',
  independent: { id: 'coffee', name: 'Coffee after 2pm', icon: 'coffee', color: '#f5b54a' },
  dependent: { id: 'sleep', name: 'Sleep', icon: 'moon', color: '#9d9fff' },
}, {
  id: 'exp2',
  name: 'Morning walk and pain',
  hypothesis: 'A morning walk may line up with lower migraine pain.',
  startDate: dateDaysAgo(20),
  endDate: dateDaysAgo(2),
  status: 'COMPLETED',
  independent: { id: 'walk', name: 'Morning walk', icon: 'steps', color: '#5ed3b5' },
  dependent: { id: 'migraine', name: 'Migraine', icon: 'brain', color: '#ff8a6b' },
}];

const CORRELATIONS = {
  variables: [
    { id: 'pain', name: 'Pain', habitName: 'Migraine', habitIcon: 'brain' },
    { id: 'hours', name: 'Hours', habitName: 'Sleep', habitIcon: 'moon' },
    { id: 'cups', name: 'Cups', habitName: 'Coffee after 2pm', habitIcon: 'coffee' },
    { id: 'mood_score', name: 'Mood', habitName: 'Mood', habitIcon: 'smile' },
  ],
  matrix: [
    [1, -0.46, 0.58, -0.62],
    [-0.46, 1, -0.64, 0.41],
    [0.58, -0.64, 1, -0.33],
    [-0.62, 0.41, -0.33, 1],
  ],
};

async function installMocks(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('datalyst_cookie_notice_v1', 'acknowledged');
    window.localStorage.setItem('datalyst-theme', 'DARK');
    window.localStorage.setItem('datalyst_insight_celebrated', '1');
    window.localStorage.setItem('datalyst_seen_insight_count', '2');
    window.sessionStorage.setItem('datalyst-activity-calendar-hint-dismissed', '1');
  });

  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const json = (body) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (pathname === '/api/user') {
      return json({ id: 'user_demo', email: 'alex@datalyst.one', name: 'Alex', profile: { name: 'Alex', onboardingCompleted: true } });
    }
    if (pathname === '/api/dashboard/today') return json(todayPayload());
    if (pathname.startsWith('/api/dashboard/activity')) return json({ days: activityDays() });
    if (pathname === '/api/dashboard') {
      return json({
        habits: dashboardHabits(),
        stats: {
          weeklyCompletion: 78,
          dailyProgress: { percentage: 60, completed: 3, total: 5 },
          weeklySummary: { daysActive: 6, totalEntries: 24, avgEntriesPerDay: 4 },
          totalLoggingDays: 28,
        },
        insights: {
          correlations: [
            { text: 'When coffee after 2pm is higher, sleep quality tends to be lower.', pValue: 0.004, n: 28, variable1: { habit: 'Coffee after 2pm' }, variable2: { habit: 'Sleep' } },
            { text: 'Higher migraine pain lines up with lower mood.', pValue: 0.012, n: 26, variable1: { habit: 'Migraine' }, variable2: { habit: 'Mood' } },
          ],
          generatedAt: new Date().toISOString(),
          cached: true,
        },
        user: { email: 'alex@datalyst.one', name: 'Alex', user_metadata: { name: 'Alex' } },
      });
    }
    if (pathname === '/api/data') return json(HISTORY);
    if (pathname === '/api/correlations') return json(CORRELATIONS);
    if (pathname.startsWith('/api/experiments/active-assignment')) return json({ experiment: null });
    if (pathname === '/api/experiments') return json(EXPERIMENTS);
    if (pathname.startsWith('/api/insights/ai/consent')) {
      return json({ consent: false, configured: true, provider: null, privacyUrl: null });
    }
    return json({});
  });
}

function esc(value) {
  return String(value).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
}

function pngDataUrl(file) {
  return `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
}

async function compose(browser, rawPath, outPath, device, eyebrow, title, subtitle) {
  const band = Math.round(device.outH * (device.id === 'ipad-13' ? 0.16 : 0.2));
  const titleSize = Math.max(40, Math.min(84, Math.round(device.outW * 0.052)));
  const page = await browser.newPage({ viewport: { width: device.outW, height: device.outH }, deviceScaleFactor: 1 });
  const html = `<!doctype html><meta charset="utf-8"><style>
    *{margin:0;box-sizing:border-box} html,body{width:${device.outW}px;height:${device.outH}px;background:#121316;overflow:hidden}
    body{font-family:Inter,system-ui,sans-serif;color:#f2f1ee;display:flex;flex-direction:column}
    header{height:${band}px;display:flex;flex-direction:column;justify-content:flex-end;padding:0 ${Math.round(device.outW * 0.06)}px ${Math.round(band * 0.12)}px;background:#121316}
    .eye{color:#9d9fff;font-weight:650;letter-spacing:.14em;text-transform:uppercase;font-size:${Math.round(titleSize * 0.34)}px}
    h1{font-size:${titleSize}px;line-height:1.05;font-weight:650;letter-spacing:-.03em;margin-top:${Math.round(titleSize * 0.22)}px}
    p{color:#aaa9a6;font-size:${Math.round(titleSize * 0.42)}px;line-height:1.3;margin-top:${Math.round(titleSize * 0.18)}px}
    img{width:${device.outW}px;height:${device.outH - band}px;object-fit:cover;object-position:top center;display:block}
  </style><header><div class="eye">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></header><img src="${pngDataUrl(rawPath)}" alt="">`;
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: outPath, type: 'png' });
  await page.close();
}

async function featureGraphic(browser, outPath, title, body) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const logo = pngDataUrl(path.join(ROOT, 'public/assets/logo.png'));
  const html = `<!doctype html><meta charset="utf-8"><style>
    *{margin:0;box-sizing:border-box} body{width:1024px;height:500px;background:#121316;color:#f2f1ee;font-family:Inter,system-ui,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:64px}
    img{width:84px;height:84px;border-radius:18px} h1{font-size:64px;letter-spacing:-.03em;margin-top:24px} p{margin-top:16px;font-size:28px;line-height:1.35;color:#aaa9a6;max-width:860px}
  </style><img src="${logo}" alt=""><h1>${esc(title)}</h1><p>${esc(body)}</p>`;
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: outPath, type: 'png' });
  await page.close();
}

function linkInto(target, linkPath) {
  ensure(path.dirname(linkPath));
  if (fs.existsSync(linkPath) || fs.lstatSync(linkPath, { throwIfNoEntry: false })) fs.unlinkSync(linkPath);
  fs.symlinkSync(path.relative(path.dirname(linkPath), target), linkPath);
}

async function captureDevice(browser, device, rawDir) {
  ensure(rawDir);
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.scale,
    isMobile: device.id !== 'ipad-13',
    hasTouch: true,
    extraHTTPHeaders: { 'x-e2e-bypass-auth': '1' },
  });
  const page = await context.newPage();
  await installMocks(page);
  for (const shot of SHOTS) {
    await page.goto(`${BASE}${shot.route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.addStyleTag({
      content: '*,*::before,*::after{animation:none!important;transition:none!important}.animate-fade-in,.animate-slide-up,.animate-scale-in,.animate-reveal-stagger{opacity:1!important;transform:none!important}::-webkit-scrollbar{display:none}',
    });
    const ready = shot.ready === 'Data'
      ? page.getByRole('heading', { name: 'Data', exact: true })
      : page.getByText(shot.ready, { exact: !shot.loose });
    await ready.first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(700);
    const target = shot.scroll === 'chart'
      ? page.locator('.recharts-wrapper').first()
      : shot.scroll
        ? page.getByText(shot.scroll, { exact: !shot.loose }).first()
        : null;
    if (target && await target.count()) {
      const block = shot.scrollBlock || 'center';
      await target.evaluate((element, scrollBlock) => element.scrollIntoView({ block: scrollBlock, inline: 'nearest' }), block);
    }
    await page.waitForTimeout(300);
    if (page.url().includes('/login')) throw new Error(`${device.id} ${shot.id} redirected to login`);
    await page.screenshot({ path: path.join(rawDir, `${shot.id}.png`) });
    console.log(`captured ${device.id} ${shot.id} (${device.outW}x${device.outH})`);
  }
  await context.close();
}

async function main() {
  const ping = await fetch(BASE).catch(() => null);
  if (!ping) throw new Error(`No server at ${BASE}. Start it with E2E_BYPASS_AUTH=1 npx next start -p 3100`);

  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/google-chrome';
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });

  const rawRoot = path.join(OUT, '_raw');
  for (const device of DEVICES) {
    await captureDevice(browser, device, path.join(rawRoot, device.id));
  }

  for (const [locale, copy] of Object.entries(LOCALES)) {
    for (const device of DEVICES) {
      const dir = path.join(OUT, locale, device.id);
      ensure(dir);
      for (const shot of SHOTS) {
        const [title, subtitle] = copy.shots[shot.key];
        const outPath = path.join(dir, `${shot.id}.png`);
        await compose(
          browser,
          path.join(rawRoot, device.id, `${shot.id}.png`),
          outPath,
          device,
          copy.eyebrow,
          title,
          subtitle,
        );
      }
    }
    const feature = path.join(OUT, locale, 'feature-graphic.png');
    await featureGraphic(browser, feature, copy.featureTitle, copy.featureBody);

    const fastlaneShots = path.join(ROOT, 'fastlane/screenshots', locale);
    const playShots = path.join(ROOT, 'fastlane/metadata/android', locale, 'images/phoneScreenshots');
    for (const device of DEVICES) {
      if (device.id === 'play-phone') continue;
      for (const shot of SHOTS) {
        linkInto(
          path.join(OUT, locale, device.id, `${shot.id}.png`),
          path.join(fastlaneShots, `${device.id}-${shot.id}.png`),
        );
      }
    }
    for (const shot of SHOTS) {
      linkInto(
        path.join(OUT, locale, 'play-phone', `${shot.id}.png`),
        path.join(playShots, `${shot.id}.png`),
      );
    }
    linkInto(feature, path.join(ROOT, 'fastlane/metadata/android', locale, 'images/featureGraphic.png'));
  }

  const icon = path.join(ROOT, 'public/icon-512.png');
  linkInto(icon, path.join(ROOT, 'fastlane/metadata/android/en-US/images/icon.png'));
  linkInto(icon, path.join(ROOT, 'fastlane/metadata/android/pt-BR/images/icon.png'));

  await browser.close();
  fs.rmSync(rawRoot, { recursive: true, force: true });
  console.log(`screenshots written to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
