import { expect, test, type Page } from '@playwright/test';

/**
 * ROADMAP.md A1 and A2.
 *
 * A1: four destinations, in the product's own words — Today, Data, Lab — with
 * Create kept on mobile.
 * A2: from a fresh account, a template starts a randomized experiment without
 * the person touching the form.
 */

const emptyDashboard = {
  habits: [],
  stats: { weeklyCompletion: 0, dailyProgress: { percentage: 0, completed: 0, total: 0 }, weeklySummary: { daysActive: 0, totalEntries: 0, avgEntriesPerDay: 0 }, totalLoggingDays: 0 },
  insights: { correlations: [] },
  readiness: [],
  user: { name: 'Synthetic' },
};

async function mockFreshAccount(page: Page) {
  await page.route('**/api/user', (route) => route.fulfill({ json: { id: 'synthetic', email: 'test@example.invalid', name: 'Synthetic', profile: { name: 'Synthetic', timezone: 'UTC', locale: 'en-US', theme: 'DARK', onboardingCompleted: true } } }));
  await page.route('**/api/user/api-keys', (route) => route.fulfill({ json: { keys: [] } }));
  await page.route('**/api/dashboard', (route) => route.fulfill({ json: emptyDashboard }));
  await page.route('**/api/dashboard/today*', (route) => route.fulfill({ json: { variables: [], logged: 0, total: 0, percentage: 0 } }));
  await page.route('**/api/dashboard/activity?*', (route) => route.fulfill({ json: { days: [] } }));
  await page.route('**/api/experiments/active-assignment', (route) => route.fulfill({ json: { assignment: null } }));
  await page.route('**/api/experiments**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: [] });
    if (request.method() === 'POST') return route.fulfill({ status: 201, json: { id: 'synthetic-exp' } });
    return route.fulfill({ json: { status: 'ACTIVE' } });
  });
  await page.route('**/api/experiments/synthetic-exp/results', (route) =>
    route.fulfill({ json: { experiment: { id: 'synthetic-exp', name: 'Does caffeine change how well I focus?', status: 'ACTIVE', startDate: '2026-01-01', endDate: '2026-01-14', type: 'RANDOMIZED' }, gated: true, progress: { totalDays: 14, loggedDays: 0, complianceRate: 0, daysRemaining: 14 } } })
  );
  let experimentBody: Record<string, unknown> | null = null;
  await page.route('**/api/experiments', async (route) => {
    if (route.request().method() === 'POST') {
      experimentBody = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { id: 'synthetic-exp' } });
    }
    return route.fulfill({ json: [] });
  });

  const created: string[] = [];
  await page.route('**/api/habits', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      created.push(body.name);
      return route.fulfill({ status: 201, json: { id: `habit-${created.length}`, name: body.name } });
    }
    return route.fulfill({ json: [] });
  });
  return { created, experimentBody: () => experimentBody };
}

for (const width of [360, 390, 412]) {
  test(`four destinations, and a template starts a running experiment (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const { created, experimentBody } = await mockFreshAccount(page);

    // A1 — the navigation says Today, Data, Lab. No "Dashboard", no "Experiments".
    await page.goto('/dashboard');
    const nav = page.getByRole('navigation', { name: 'Main' }).last();
    await expect(nav.getByRole('link', { name: 'Today' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Data' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Lab' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Create tracker' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Experiments', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // A2 — the template card creates what it needs and starts the experiment.
    await nav.getByRole('link', { name: 'Lab' }).click();
    await page.getByRole('link', { name: /Caffeine → Focus/ }).click();
    await expect(page.getByRole('heading', { name: 'Caffeine → Focus' })).toBeVisible();
    await expect(page.getByText('Caffeine — what you change')).toBeVisible();
    await expect(page.getByText('Deep Work — what you measure')).toBeVisible();
    await expect(page.getByText(/created with this experiment/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByRole('button', { name: 'Start experiment' }).click();

    // The one decision is when; everything else was already decided by the template.
    await expect(page).toHaveURL(/\/lab\/synthetic-exp$/);
    await expect(page.getByRole('heading', { name: 'Results Locked Until Completion' })).toBeVisible();
    expect(created).toEqual(['Caffeine', 'Deep Work']);

    // The dates and the block schedule the schema will receive. The start date was a day off
    // outside UTC before the fix (local setDate, UTC toISOString read-back).
    const posted = experimentBody()!;
    const todayUtc = new Date().toISOString().slice(0, 10);
    const tomorrowUtc = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect([todayUtc, tomorrowUtc]).toContain(posted.startDate);
    const days = (new Date(`${posted.endDate}T00:00:00Z`).getTime() - new Date(`${posted.startDate}T00:00:00Z`).getTime()) / 86_400_000 + 1;
    expect(days).toBe(14);
    // 6 is a valid balanced block for two conditions and the schema's 2..24 bound.
    expect(posted.blockSize).toBe(6);
    expect(posted.type).toBe('RANDOMIZED');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
