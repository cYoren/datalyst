import { afterEach, describe, expect, it } from 'vitest';
import { BRAND, canonicalUrl, siteOrigin } from './brand';

describe('brand naming limits', () => {
    it('fits store title and subtitle limits', () => {
        for (const value of [BRAND.storeTitle, BRAND.storeTitlePt, BRAND.storeSubtitle, BRAND.storeSubtitlePt]) {
            expect(value.length).toBeLessThanOrEqual(30);
        }
        expect(BRAND.tagline.length).toBeLessThanOrEqual(80);
        expect(BRAND.taglinePt.length).toBeLessThanOrEqual(80);
    });

    it('keeps the Portuguese tagline and its English equivalent', () => {
        expect(BRAND.taglinePt).toBe('Registre sintomas e hábitos e descubra o que afeta sua saúde.');
        expect(BRAND.tagline).toMatch(/symptoms and habits/i);
        expect(BRAND.tagline).toMatch(/health/i);
    });
});

describe('canonical origin', () => {
    const previousSite = process.env.NEXT_PUBLIC_SITE_URL;
    const previousApp = process.env.NEXT_PUBLIC_APP_URL;

    afterEach(() => {
        if (previousSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
        else process.env.NEXT_PUBLIC_SITE_URL = previousSite;
        if (previousApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
        else process.env.NEXT_PUBLIC_APP_URL = previousApp;
    });

    it('points the apex host at www so the canonical is not a redirect', () => {
        process.env.NEXT_PUBLIC_SITE_URL = 'https://datalyst.one';
        expect(siteOrigin()).toBe('https://www.datalyst.one');
        expect(canonicalUrl('/privacy')).toBe('https://www.datalyst.one/privacy');
        expect(canonicalUrl('/')).toBe('https://www.datalyst.one');
    });

    it('leaves a local origin alone', () => {
        process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
        expect(siteOrigin()).toBe('http://localhost:3000');
    });
});
