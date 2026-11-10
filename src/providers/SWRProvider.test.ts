import { beforeEach, describe, expect, it } from 'vitest';
import { clearPersistedCache, readPersistedCache, setCacheOwner } from './SWRProvider';

const KEY = 'datalyst-swr-cache';

function persist(owner: string, entries: Record<string, unknown>, version = 2) {
    window.localStorage.setItem(KEY, JSON.stringify({ version, owner, entries }));
}

function hydrate(owner: string | null) {
    setCacheOwner(owner);
    const map = new Map<string, unknown>();
    readPersistedCache(map);
    return map;
}

describe('persisted SWR cache', () => {
    beforeEach(() => {
        window.localStorage.clear();
        setCacheOwner(null);
    });

    it('never overwrites a response that already arrived this session', () => {
        persist('user-a', { '/api/dashboard': { streak: 4 }, '/api/entries': { stale: true } });
        setCacheOwner('user-a');
        const map = new Map<string, unknown>([['/api/dashboard', { streak: 9 }]]);
        readPersistedCache(map);
        // Fresh wins; the entry that was not fetched yet is restored.
        expect(map.get('/api/dashboard')).toEqual({ streak: 9 });
        expect(map.get('/api/entries')).toEqual({ stale: true });
    });

    it('restores a cache written by the same account', () => {
        persist('user-a', { '/api/dashboard': { streak: 4 } });
        const map = hydrate('user-a');
        expect(map.get('/api/dashboard')).toEqual({ streak: 4 });
        expect(window.localStorage.getItem(KEY)).not.toBeNull();
    });

    it('drops a cache written by another account', () => {
        persist('user-a', { '/api/dashboard': { streak: 4 } });
        const map = hydrate('user-b');
        expect(map.size).toBe(0);
        // Dropped, not merely ignored: the next account must not inherit it either.
        expect(window.localStorage.getItem(KEY)).toBeNull();
    });

    it('restores nothing while the account is unknown', () => {
        persist('user-a', { '/api/dashboard': { streak: 4 } });
        expect(hydrate(null).size).toBe(0);
    });

    it('drops an older blob shape', () => {
        persist('user-a', { '/api/dashboard': { streak: 4 } }, 1);
        expect(hydrate('user-a').size).toBe(0);
    });

    it('drops an unattributed blob', () => {
        window.localStorage.setItem(KEY, JSON.stringify({ version: 2, entries: { '/api/dashboard': { streak: 4 } } }));
        expect(hydrate('user-a').size).toBe(0);
    });

    it('drops unparsable storage instead of throwing', () => {
        window.localStorage.setItem(KEY, '{not json');
        expect(hydrate('user-a').size).toBe(0);
    });

    it('clears every persisted cache key on sign-out', () => {
        persist('user-a', { '/api/dashboard': { streak: 4 } });
        window.localStorage.setItem(`${KEY}:user-a`, '{}');
        clearPersistedCache();
        expect(window.localStorage.getItem(KEY)).toBeNull();
        expect(window.localStorage.getItem(`${KEY}:user-a`)).toBeNull();
    });
});
