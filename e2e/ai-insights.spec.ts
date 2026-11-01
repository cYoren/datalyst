import { expect, test } from '@playwright/test';

for (const width of [360, 390, 412]) {
  test(`AI consent and evidence flow (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const unauthorizedRequests: string[] = [];
    page.on('response', response => { if (response.status() === 401) unauthorizedRequests.push(response.url()); });
    let consent = false;
    await page.route('**/api/user/api-keys', route => route.fulfill({ json: { keys: [] } }));
    await page.route('**/api/user', route => route.fulfill({ json: { id: 'synthetic', email: 'test@example.invalid', profile: { name: 'Synthetic', timezone: 'UTC', locale: 'en-US', theme: 'DARK', onboardingCompleted: true } } }));
    await page.route('**/api/insights/ai/consent', async route => {
      if (route.request().method() === 'PATCH') consent = route.request().postDataJSON().consent;
      await route.fulfill({ json: { consent, configured: true } });
    });
    // Install dashboard fixtures before navigation: Next may prefetch linked pages.
    await page.route('**/api/dashboard', route => route.fulfill({ json: { habits: [], stats: { weeklyCompletion: 0, dailyProgress: { percentage: 0, completed: 0, total: 0 }, weeklySummary: { daysActive: 0, totalEntries: 0, avgEntriesPerDay: 0 }, totalLoggingDays: 0 }, insights: { correlations: [] }, user: { name: 'Synthetic' } } }));
    await page.route('**/api/data', route => route.fulfill({ json: { habits: [], entries: [] } }));
    await page.route('**/api/dashboard/today*', route => route.fulfill({ json: { variables: [], logged: 0, total: 0, percentage: 0 } }));
    await page.route('**/api/dashboard/activity?*', route => route.fulfill({ json: { days: [] } }));
    await page.route('**/api/experiments/active-assignment', route => route.fulfill({ json: { assignment: null } }));
    let includePlan = true;
    await page.route('**/api/insights/ai', route => route.fulfill({ json: { state: 'ready', result: {
      findings: [{ evidence: { id: 1, variable1: { habit: 'Walk' }, variable2: { habit: 'Focus' }, coefficient: 0.6, pValue: 0.002, n: 30 }, explanation: 'An association does not establish cause and effect.' }],
      nextExperiment: includePlan ? { independentId: 'habit-walk', dependentId: 'habit-focus', power: { requiredDays: 28 }, note: 'Review feasibility.' } : null, limitations: 'Exploratory evidence.',
    } } }));
    await page.goto('/settings');
    const checkbox = page.getByRole('checkbox', { name: 'Allow AI evidence insights' });
    await expect(checkbox).toBeEnabled();
    await checkbox.click();
    await expect(page.getByRole('status')).toHaveText('AI insights enabled.');
    await checkbox.click();
    await expect(page.getByRole('status')).toContainText('cached AI results removed');
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Explain my evidence' }).click();
    await expect(page.getByText('[Evidence 1] Walk and Focus')).toBeVisible();
    await expect(page.getByText('r = 0.600 · p = 0.00200 · n = 30')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Review next experiment in Lab' })).toHaveAttribute('href', '/lab/new?independent=habit-walk&dependent=habit-focus');
    includePlan = false;
    await page.getByRole('button', { name: 'Explain my evidence' }).click();
    await expect(page.getByText('[Evidence 1] Walk and Focus')).toBeVisible();
    await expect(page.getByText(/A Lab experiment needs two distinct trackers/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Review next experiment in Lab' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(unauthorizedRequests).toEqual([]);
  });
}
