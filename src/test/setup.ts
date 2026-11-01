import "@testing-library/jest-dom/vitest";

if (typeof window !== "undefined" && !window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => { /* deprecated */ },
            removeListener: () => { /* deprecated */ },
            addEventListener: () => { /* noop */ },
            removeEventListener: () => { /* noop */ },
            dispatchEvent: () => false,
        }),
    });
}

// Node 25+ ships its own localStorage global, which is undefined without
// --localstorage-file and hides jsdom's. Give tests a plain in-memory one.
if (typeof window !== "undefined" && !window.localStorage) {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => void store.set(key, String(value)),
            removeItem: (key: string) => void store.delete(key),
            clear: () => store.clear(),
            key: (i: number) => [...store.keys()][i] ?? null,
            get length() { return store.size; },
        },
    });
}
