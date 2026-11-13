"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

const CHECKIN_ID = "daily-checkin";

/**
 * Scrolls to the check-in once it exists. A client navigation resolves the route before the
 * dashboard has fetched its day, so the element is usually not in the DOM yet; retry briefly
 * instead of landing at the top of the page, which is the whole point of the deep link.
 */
function scrollToCheckin(attempt = 0) {
    const target = document.getElementById(CHECKIN_ID);
    if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
    }
    if (attempt < 20) setTimeout(() => scrollToCheckin(attempt + 1), 150);
}

function handleLink(url: string, goToDashboard: () => void) {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return;
    }
    // The auth callback owns datalyst://auth (NativeAuthCallback); this owns the
    // widget's check-in link and nothing else.
    if (parsed.protocol !== "datalyst:" || parsed.hostname !== "dashboard") return;

    if (window.location.pathname === "/dashboard") {
        scrollToCheckin();
        return;
    }
    goToDashboard();
    // The router push resolves the route, not the data; wait for the section to render.
    scrollToCheckin();
}

/**
 * Landing point for `datalyst://dashboard/checkin`, which the home screen widget opens
 * so a tap goes to the check-in instead of the top of the dashboard. No-op on web.
 */
export function NativeCheckinLink() {
    const router = useRouter();

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        const goToCheckin = () => router.push(`/dashboard#${CHECKIN_ID}`);
        let disposed = false;
        let listener: { remove: () => Promise<void> } | undefined;

        const setup = async () => {
            listener = await App.addListener("appUrlOpen", ({ url }) => {
                if (!disposed) handleLink(url, goToCheckin);
            });

            const launch = await App.getLaunchUrl();
            if (!disposed && launch?.url) handleLink(launch.url, goToCheckin);
        };

        void setup();
        return () => {
            disposed = true;
            void listener?.remove();
        };
    }, [router]);

    return null;
}
