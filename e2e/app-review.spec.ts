import { expect, test, type Page } from '@playwright/test';

const syntheticResults = {
  experiment: { id: 'synthetic', name: 'Morning routine and daily concentration pilot', status: 'COMPLETED', startDate: '2026-01-01', endDate: '2026-01-14', type: 'RANDOMIZED' },
  independent: { name: 'Morning walking routine', icon: '○', variable: 'Walking', unit: 'minutes' },
  dependent: { name: 'Self-reported daily concentration', icon: '○', variable: 'Concentration', unit: 'points' },
  chartData: [{ date: '2026-01-01', independent: 10, dependent: 5, isWashout: false, condition: 'A' }, { date: '2026-01-02', independent: 20, dependent: 7, isWashout: false, condition: 'B' }],
  stats: { totalDays: 14, loggedDays: 2, correlation: 0.5, correlationType: 'pearson', strength: 'Moderate', conditionLabels: ['A', 'B'], interpretation: { headline: 'An exploratory difference in concentration', effectDescription: 'The recorded conditions differed.', confidenceStatement: 'Collect more observations to check this pattern.', magnitude: 'moderate', recommendation: 'Review the study assumptions.', nextSteps: [], emoji: '○' }, n1: { conditionAMean: 5, conditionBMean: 7, conditionAStd: 1, conditionBStd: 1, nA: 7, nB: 7, effectSize: 0.1, effectLabel: 'Negligible', tTest: { tStatistic: 0.2, pValue: 0.8, significant: false }, bayesian: { probabilityOfEffect: 0.6, posteriorMean: 0.2, posteriorStd: 1, credibleInterval: [-0.5, 0.9] }, autocorrelation: { lag1: 0.2, isProblematic: false, warning: null } } },
};

async function setup(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 });
  await page.route('**/api/experiments/*/attestations', route => route.fulfill({ json: { records: [] } }));
  await page.route('**/api/user', route => route.fulfill({ json: { email: 'synthetic@example.invalid', name: 'Synthetic', profile: { name: 'Synthetic', timezone: 'UTC', locale: 'en-US', theme: 'LIGHT', healthDataConsent: false } } }));
}

async function contrast(page: Page, text: string) {
  return page.getByText(text, { exact: true }).evaluate(element => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'white'; context.fillRect(0, 0, 1, 1);
    const ancestors: Element[] = []; let current: Element | null = element;
    while (current) { ancestors.unshift(current); current = current.parentElement; }
    for (const ancestor of ancestors) { context.fillStyle = getComputedStyle(ancestor).backgroundColor; context.fillRect(0, 0, 1, 1); }
    const background = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    context.fillStyle = getComputedStyle(element).color; context.fillRect(0, 0, 1, 1);
    const foreground = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    const luminance = (rgb: number[]) => rgb.map(value => { const v = value / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

for (const width of [360, 390, 412]) {
  test(`Lab detail, gated results and loading fit ${width}px`, async ({ page }) => {
    await setup(page, width);
    await page.route('**/api/dashboard', () => {});
    await page.goto('/dashboard');
    await expect(page.getByRole('status', { name: 'Loading dashboard' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.route('**/api/experiments/synthetic/results', route => route.fulfill({ json: syntheticResults }));
    await page.goto('/lab/synthetic');
    await expect(page.getByRole('heading', { name: syntheticResults.experiment.name })).toBeVisible();
    await expect(page.getByText('Negligible standardized difference')).toBeVisible();
    await expect(page.getByText(/Outcome difference:.*points.*credible interval/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await contrast(page, syntheticResults.stats.interpretation.confidenceStatement)).toBeGreaterThanOrEqual(4.5);
    await page.unroute('**/api/experiments/synthetic/results');
    await page.route('**/api/experiments/synthetic/results', route => route.fulfill({ json: { experiment: { ...syntheticResults.experiment, status: 'ACTIVE' }, gated: true, progress: { totalDays: 14, loggedDays: 2, complianceRate: 14, daysRemaining: 12 } } }));
    await page.goto('/lab/synthetic');
    await expect(page.getByRole('heading', { name: 'Results Locked Until Completion' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await contrast(page, 'Results Locked Until Completion')).toBeGreaterThanOrEqual(4.5);
    await page.unroute('**/api/dashboard');
  });
}

test('saving dark-only settings preserves the stored theme preference', async ({ page }) => {
  await setup(page, 390);
  let saved: Record<string, unknown> | null = null;
  await page.unroute('**/api/user');
  await page.route('**/api/user', async route => {
    const profile = { name: 'Synthetic', timezone: 'UTC', locale: 'en-US', theme: 'LIGHT', healthDataConsent: false };
    if (route.request().method() === 'PATCH') { saved = route.request().postDataJSON(); return route.fulfill({ json: profile }); }
    return route.fulfill({ json: { email: 'synthetic@example.invalid', name: 'Synthetic', profile } });
  });
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Profile updated.')).toBeVisible();
  expect(saved).not.toHaveProperty('theme');
  expect(await page.locator('html').getAttribute('class')).toContain('dark');
  await expect(page.getByRole('combobox', { name: /theme/i })).toHaveCount(0);
});

test('public sharing requires confirmation and uses a public results URL', async ({ page }) => {
  await setup(page, 390);
  let isPublic = false;
  let publications = 0;
  await page.addInitScript(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: { url: string }) => localStorage.setItem('synthetic-shared-url', data.url) }); });
  await page.route('**/api/experiments/synthetic/results', route => route.fulfill({ json: { ...syntheticResults, experiment: { ...syntheticResults.experiment, isPublic, slug: 'synthetic-public' } } }));
  await page.route('**/api/experiments/synthetic/sharing', route => {
    isPublic = route.request().postDataJSON().isPublic;
    if (isPublic) publications++;
    return route.fulfill({ json: { isPublic, slug: 'synthetic-public' } });
  });
  await page.goto('/lab/synthetic');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Enable public sharing' }).click();
  expect(publications).toBe(0);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Enable public sharing' }).click();
  await expect(page.getByRole('button', { name: 'Share public results' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('synthetic-shared-url'))).toMatch(/\/share\/synthetic-public$/);
  await page.getByRole('button', { name: 'Stop public sharing' }).click();
  await expect(page.getByRole('button', { name: 'Enable public sharing' })).toBeVisible();
  expect(isPublic).toBe(false);
});
