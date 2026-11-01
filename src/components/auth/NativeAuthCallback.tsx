"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";

function handleCallbackUrl(url: string) {
    const callback = new URL(url);
    if (callback.protocol !== "datalyst:" || callback.hostname !== "auth") return;

    void Browser.close().catch(() => undefined);

    const code = callback.searchParams.get("code");
    if (code) {
        const next = callback.searchParams.get("next") ?? "/dashboard";
        const query = new URLSearchParams({ code, next });
        window.location.assign(`/auth/callback?${query.toString()}`);
        return;
    }

    const error = callback.searchParams.get("error_description") ?? callback.searchParams.get("error");
    const query = error ? `?error=${encodeURIComponent(error)}` : "?error=auth_callback_error";
    window.location.assign(`/login${query}`);
}

export function NativeAuthCallback() {
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        let disposed = false;
        let listener: { remove: () => Promise<void> } | undefined;

        const setup = async () => {
            listener = await App.addListener("appUrlOpen", ({ url }) => {
                if (!disposed) handleCallbackUrl(url);
            });

            const launch = await App.getLaunchUrl();
            if (!disposed && launch?.url) handleCallbackUrl(launch.url);
        };

        void setup();
        return () => {
            disposed = true;
            void listener?.remove();
        };
    }, []);

    return null;
}
