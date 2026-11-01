import { useSyncExternalStore } from 'react';

const noop = () => () => {};
/** window.location.origin on the client, '' during server render (no hydration mismatch). */
export function useOrigin() {
    return useSyncExternalStore(noop, () => window.location.origin, () => '');
}
