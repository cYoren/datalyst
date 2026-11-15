/**
 * Test-only helpers for the connected-app integration walk. Kept in their own file so the spec
 * reads as the contract it verifies.
 */
import { authenticateAppKey } from '@/lib/agent-auth';

/** True when the app API would accept this key (it is active, app-scoped and not revoked). */
export async function authenticatesAppKey(key: string): Promise<boolean> {
    const agent = await authenticateAppKey(new Request('http://localhost/api/v1/app/me', {
        headers: { authorization: `Bearer ${key}` },
    }));
    return Boolean(agent?.appId);
}
