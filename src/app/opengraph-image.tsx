import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Datalyst — Statistical Habit Tracker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          background: "#FAF8F5",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle graph lines background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(15,118,110,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(15,118,110,0.06) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Warm gradient overlay — bottom */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "200px",
            background: "linear-gradient(0deg, #F5F1EA 0%, transparent 100%)",
          }}
        />

        {/* Teal accent circle top-right */}
        <div
          style={{
            position: "absolute",
            top: "-120px",
            right: "-120px",
            width: "380px",
            height: "380px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(15,118,110,0.1) 0%, transparent 70%)",
          }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            position: "relative",
          }}
        >
          {/* Left content */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "56px 72px",
            }}
          >
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "#0F766E",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ color: "#fff", fontSize: "20px", fontWeight: "700" }}>D</span>
              </div>
              <span
                style={{
                  fontSize: "22px",
                  fontWeight: "700",
                  color: "#1C1410",
                  letterSpacing: "-0.3px",
                }}
              >
                Datalyst
              </span>
            </div>

            {/* Headline */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  color: "#0F766E",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                }}
              >
                Free · Statistical · Habit Tracker
              </span>

              <div style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{
                    fontSize: "60px",
                    fontWeight: "800",
                    color: "#1C1410",
                    lineHeight: "1.0",
                    letterSpacing: "-2px",
                  }}
                >
                  Track habits.
                </span>
                <span
                  style={{
                    fontSize: "60px",
                    fontWeight: "800",
                    lineHeight: "1.0",
                    letterSpacing: "-2px",
                    color: "#0F766E",
                  }}
                >
                  Find correlations.
                </span>
              </div>

              <span
                style={{
                  fontSize: "19px",
                  color: "#54504B",
                  lineHeight: "1.5",
                  maxWidth: "480px",
                }}
              >
                After 14 days, Datalyst runs Pearson & Spearman statistics to reveal what actually affects your sleep, energy, and focus.
              </span>
            </div>

            {/* Stat pills */}
            <div style={{ display: "flex", gap: "12px" }}>
              {[
                { label: "Pearson r", value: "0.78" },
                { label: "p-value", value: "< 0.05" },
                { label: "Spearman ρ", value: "0.71" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    padding: "12px 20px",
                    borderRadius: "12px",
                    background: "#fff",
                    border: "1px solid #E7E1D8",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    boxShadow: "0 2px 8px rgba(28,20,16,0.05)",
                  }}
                >
                  <span style={{ fontSize: "22px", fontWeight: "700", color: "#0F766E" }}>
                    {stat.value}
                  </span>
                  <span style={{ fontSize: "11px", color: "#9B938C", fontWeight: "500", letterSpacing: "0.5px" }}>
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — chart visualization */}
          <div
            style={{
              width: "380px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              paddingRight: "60px",
            }}
          >
            <div
              style={{
                width: "300px",
                height: "200px",
                position: "relative",
                display: "flex",
                alignItems: "flex-end",
                gap: "10px",
              }}
            >
              {/* Bar chart */}
              {[
                { h: 80, c: "#CCFBF1" },
                { h: 120, c: "#99F6E4" },
                { h: 100, c: "#CCFBF1" },
                { h: 160, c: "#0F766E" },
                { h: 140, c: "#0D9488" },
                { h: 180, c: "#0F766E" },
                { h: 155, c: "#0D9488" },
                { h: 190, c: "#0F766E" },
              ].map((bar, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${bar.h}px`,
                    background: bar.c,
                    borderRadius: "6px 6px 0 0",
                  }}
                />
              ))}

              {/* Trend line */}
              <div
                style={{
                  position: "absolute",
                  bottom: "80px",
                  left: "0",
                  right: "0",
                  height: "2px",
                  background: "#1C1410",
                  opacity: 0.15,
                  borderRadius: "1px",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
