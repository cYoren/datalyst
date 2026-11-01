import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface NativeSessionPayload {
    accessToken?: unknown;
    refreshToken?: unknown;
}

export async function POST(request: NextRequest) {
    let payload: NativeSessionPayload;

    try {
        payload = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid session payload" }, { status: 400 });
    }

    const accessToken = typeof payload.accessToken === "string" ? payload.accessToken : "";
    const refreshToken = typeof payload.refreshToken === "string" ? payload.refreshToken : "";

    if (!accessToken || !refreshToken) {
        return NextResponse.json({ error: "A complete Supabase session is required" }, { status: 400 });
    }

    try {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
        });

        if (error || !data.user) {
            return NextResponse.json({ error: error?.message ?? "Invalid Supabase session" }, { status: 401 });
        }

        return NextResponse.json({ userId: data.user.id });
    } catch (error) {
        console.error("Error synchronizing native auth session:", error);
        return NextResponse.json({ error: "Unable to synchronize native auth session" }, { status: 500 });
    }
}
