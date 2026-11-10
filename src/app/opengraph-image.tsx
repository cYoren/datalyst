import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BRAND } from "@/lib/brand";

export const runtime = "nodejs";
export const alt = BRAND.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logo = await readFile(join(process.cwd(), "public/assets/logo.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          background: "#121316",
          color: "#f2f1ee",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-80px",
            right: "-40px",
            width: "420px",
            height: "420px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(157,159,255,0.28) 0%, transparent 68%)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "64px 72px",
            width: "100%",
            height: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <img src={logoSrc} width={64} height={64} alt="" style={{ borderRadius: "14px" }} />
            <span style={{ fontSize: "28px", fontWeight: 650, letterSpacing: "-0.4px" }}>Datalyst</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "920px" }}>
            <span
              style={{
                fontSize: "18px",
                fontWeight: 650,
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: "#9d9fff",
              }}
            >
              Symptom and habit tracker
            </span>
            <span style={{ fontSize: "64px", fontWeight: 700, lineHeight: 1.02, letterSpacing: "-1.8px" }}>
              Log symptoms and habits.
            </span>
            <span style={{ fontSize: "64px", fontWeight: 700, lineHeight: 1.02, letterSpacing: "-1.8px", color: "#5ed3b5" }}>
              See what affects your health.
            </span>
          </div>

          <span style={{ fontSize: "24px", color: "#aaa9a6", maxWidth: "820px" }}>
            How what you do relates to how you feel.
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
