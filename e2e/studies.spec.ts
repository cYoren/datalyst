import { expect, test } from '@playwright/test';
import { exampleProtocol, participationDisclosure } from '../src/studies/protocol';

for (const width of [360, 390, 412]) {
  test(`study protocol, consent and withdrawal flow fits ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    let created = false;
    let recruiting = false;
    let withdrawn = false;
    const code = 'a'.repeat(36);
    const hash = 'b'.repeat(64);
    await page.route('**/api/user', route => route.fulfill({ json: { email: 'synthetic@example.invalid', name: 'Synthetic Participant' } }));
    await page.route(/\/api\/studies(?:\/|$)/, async route => {
      const path = new URL(route.request().url()).pathname;
      const post = route.request().method() === 'POST';
      if (path === '/api/studies') {
        if (post) { created = true; return route.fulfill({ json: { id: 'synthetic-study' } }); }
        return route.fulfill({ json: { researcher: created ? [{ id: 'synthetic-study', name: 'Morning focus pilot', status: 'DRAFT' }] : [], participant: [] } });
      }
      if (path === `/api/studies/join/${code}`) return route.fulfill({ json: post ? { id: 'synthetic-study' } : { name: 'Morning focus pilot', protocol: exampleProtocol, protocolHash: hash } });
      if (path.endsWith('/withdraw')) { withdrawn = true; return route.fulfill({ json: { withdrawn: true } }); }
      if (path.endsWith('/participation')) return route.fulfill({ json: { name: 'Morning focus pilot', protocol: exampleProtocol, withdrawnAt: withdrawn ? '2026-10-07T12:00:00Z' : null, experimentId: 'synthetic-experiment', schedule: [{ date: exampleProtocol.startDate, condition: 'B' }], consent: { acceptedAt: '2026-10-07T12:00:00Z', protocolHash: hash, text: `${exampleProtocol.consentText}\n\n${participationDisclosure}` } } });
      if (post) recruiting = true;
      return route.fulfill({ json: { study: { id: 'synthetic-study', name: 'Morning focus pilot', status: recruiting ? 'RECRUITING' : 'DRAFT', protocol: exampleProtocol, protocolHash: hash }, role: 'OWNER', joinCode: code, participants: [], rows: [], effects: [], excluded: [], invalidDays: 0, metaAnalysis: null, limitations: 'Exploratory analysis only.' } });
    });
    await page.goto('/lab/studies');
    await expect(page.getByRole('heading', { name: 'Studies', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Create study draft' }).click();
    await page.getByRole('link', { name: 'Morning focus pilot', exact: false }).click();
    await page.getByRole('button', { name: 'Approve protocol and open recruitment' }).click();
    await page.getByRole('link', { name: `/join/${code}` }).click();
    const joinButton = page.getByRole('button', { name: 'Consent and join study' });
    await expect(joinButton).toBeDisabled();
    await page.getByText('I have read the protocol and data disclosure, can contact the study team, and voluntarily consent to participate and share these study observations.', { exact: true }).click();
    await expect(page.getByRole('checkbox')).toBeChecked();
    await joinButton.click();
    await page.getByRole('link', { name: 'View schedule and consent' }).click();
    await expect(page.getByRole('heading', { name: 'Your daily assignments' })).toBeVisible();
    await expect(page.getByText('2026-11-01 · B')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByText('I want to end participation and withdraw research data access.', { exact: true }).click();
    await expect(page.getByRole('checkbox')).toBeChecked();
    await page.getByRole('button', { name: 'Withdraw participation' }).click();
    await expect(page.getByText(/Your data is excluded from future research views and exports/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Withdraw participation' })).toHaveCount(0);
  });
}
