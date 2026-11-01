import { expect, test } from '@playwright/test';

for (const width of [360, 390, 412]) {
    test(`proof verification fits ${width}px and distinguishes untrusted signers`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.route('**/api/verify', route => route.fulfill({ json: { valid: true, signedByDatalyst: false, message: 'Synthetic verification fixture', proofs: [{ kind: 'RESULTS', mode: 'offchain', signer: `0x${'a'.repeat(40)}`, uid: `0x${'b'.repeat(64)}` }] } }));
        await page.goto('/verify');
        await page.getByLabel('Proof bundle JSON').fill('{"synthetic":true}');
        await page.getByRole('button', { name: 'Verify content integrity' }).click();
        await expect(page.getByRole('heading', { name: 'Content integrity verified' })).toBeVisible();
        await expect(page.getByText(/Signer identity is not trusted/)).toBeVisible();
        await expect(page.getByText(/no independent timestamp/)).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.unroute('**/api/verify');
        await page.route('**/api/verify', route => route.fulfill({ status: 400, json: { valid: false, error: 'Evidence changed' } }));
        await page.getByRole('button', { name: 'Verify content integrity' }).click();
        await expect(page.getByRole('heading', { name: 'Verification failed' })).toBeVisible();
        await expect(page.getByText('Evidence changed')).toBeVisible();
    });
}
