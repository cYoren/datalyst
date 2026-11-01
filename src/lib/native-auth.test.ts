import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    authorize: vi.fn(),
    signInWithIdToken: vi.fn(),
    isNativePlatform: vi.fn(),
    getPlatform: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
    Capacitor: {
        isNativePlatform: mocks.isNativePlatform,
        getPlatform: mocks.getPlatform,
    },
}));

vi.mock("@capacitor-community/apple-sign-in", () => ({
    SignInWithApple: { authorize: mocks.authorize },
}));

vi.mock("@capacitor/browser", () => ({
    Browser: { open: vi.fn() },
}));

vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        auth: { signInWithIdToken: mocks.signInWithIdToken },
    }),
}));

import { signInWithNativeApple } from "@/lib/native-auth";

describe("signInWithNativeApple", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isNativePlatform.mockReturnValue(true);
        mocks.getPlatform.mockReturnValue("ios");
        mocks.authorize.mockResolvedValue({ response: { identityToken: "apple-id-token" } });
        mocks.signInWithIdToken.mockResolvedValue({
            data: {
                session: {
                    access_token: "supabase-access-token",
                    refresh_token: "supabase-refresh-token",
                },
            },
            error: null,
        });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    });

    it("synchronizes the Supabase session with the Next.js cookie session", async () => {
        await signInWithNativeApple();

        expect(mocks.signInWithIdToken).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: "apple",
                token: "apple-id-token",
                nonce: expect.any(String),
            })
        );
        expect(fetch).toHaveBeenCalledWith(
            "/api/auth/native-session",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    accessToken: "supabase-access-token",
                    refreshToken: "supabase-refresh-token",
                }),
            })
        );
    });

    it("reports the provider error instead of showing a generic login failure", async () => {
        mocks.signInWithIdToken.mockResolvedValue({
            data: { session: null },
            error: { message: "Invalid nonce" },
        });

        await expect(signInWithNativeApple()).rejects.toThrow(
            "Apple authentication was rejected by Datalyst: Invalid nonce"
        );
        expect(fetch).not.toHaveBeenCalled();
    });

    it("reports the server detail when native session synchronization fails", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: false,
            json: vi.fn().mockResolvedValue({ error: "Session expired" }),
        }));

        await expect(signInWithNativeApple()).rejects.toThrow(
            "Apple sign-in succeeded, but Session expired"
        );
    });
});
