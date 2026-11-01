import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SignInWithApple } from "@capacitor-community/apple-sign-in";
import { createClient } from "@/lib/supabase/client";

export const NATIVE_AUTH_CALLBACK = "datalyst://auth/callback";

function isNativeIOS() {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

function createNonce(length = 32) {
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._";
    const values = new Uint8Array(length);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

async function sha256(value: string) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    // Apple embeds the SHA-256 digest of the nonce in the identity token as raw
    // base64. Hex encoding would not match, so the digest must be base64-encoded.
    const raw = new Uint8Array(digest);
    let binary = "";
    for (const byte of raw) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

export async function signInWithNativeApple() {
    if (!isNativeIOS()) {
        throw new Error("Native Apple sign-in is only available on iOS.");
    }

    const rawNonce = createNonce();
    const hashedNonce = await sha256(rawNonce);
    const result = await SignInWithApple.authorize({
        // The native flow uses the app's bundle identifier. The plugin keeps
        // clientId and redirectURI in its cross-platform API for web-service flows.
        clientId: "com.datalyst.app",
        redirectURI: NATIVE_AUTH_CALLBACK,
        scopes: "email name",
        nonce: hashedNonce,
    });

    const identityToken = result.response?.identityToken?.trim();
    if (!identityToken) {
        throw new Error("Apple did not return an identity token.");
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: identityToken,
        nonce: rawNonce,
    });

    if (error) {
        throw new Error(`Apple authentication was rejected by Datalyst: ${error.message}`);
    }
    if (!data.session?.access_token || !data.session.refresh_token) {
        throw new Error("Apple sign-in completed without a usable Datalyst session.");
    }

    const syncResponse = await fetch("/api/auth/native-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
        }),
    });

    if (!syncResponse.ok) {
        let detail = "the Datalyst session could not be synchronized.";
        try {
            const payload = await syncResponse.json() as { error?: unknown };
            if (typeof payload.error === "string" && payload.error.trim()) {
                detail = payload.error;
            }
        } catch {
            // Keep the stable user-facing message when the server returns no JSON.
        }
        throw new Error(`Apple sign-in succeeded, but ${detail}`);
    }

    return result.response;
}

export async function startOAuth(provider: "google" | "apple") {
    const supabase = createClient();
    const isNative = Capacitor.isNativePlatform();
    const redirectTo = isNative
        ? NATIVE_AUTH_CALLBACK
        : `${window.location.origin}/auth/callback`;

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo,
            skipBrowserRedirect: true,
            ...(provider === "google"
                ? { queryParams: { access_type: "offline", prompt: "consent" } }
                : {}),
        },
    });

    if (error) throw error;
    if (!data.url) throw new Error(`Unable to start ${provider} sign-in.`);

    if (isNative) {
        await Browser.open({ url: data.url });
    } else {
        window.location.assign(data.url);
    }
}

export async function finishNativeAuth(router: AppRouterInstance) {
    const response = await fetch("/api/user", { cache: "no-store" });
    if (!response.ok) {
        throw new Error("Authentication succeeded, but the Datalyst profile could not be loaded.");
    }

    const user = await response.json();
    router.replace(user.profile?.onboardingCompleted ? "/dashboard" : "/onboarding");
    router.refresh();
}

export function isNativeAppleAvailable() {
    return isNativeIOS();
}
