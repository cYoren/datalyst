import type { Metadata, Viewport } from "next";
import { Archivo, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { CookieNotice } from "@/components/ui/CookieNotice";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { NativeAuthCallback } from "@/components/auth/NativeAuthCallback";
import { WebMcpTools } from "@/components/agent/WebMcpTools";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Datalyst — Free Habit Tracker & Correlation Analysis",
  description: "Track daily habits and discover real statistical relationships. Datalyst runs Pearson and Spearman analysis with p-values to show what tends to move with your sleep, energy, and focus. Free.",
  keywords: ["habit tracker", "habit tracking", "daily habit tracker", "correlation analysis", "sleep tracker", "quantified self", "personal analytics", "lifestyle tracking", "self-optimization", "statistical habit tracker", "habit correlation"],
  authors: [{ name: "Datalyst" }],
  creator: "Datalyst",
  verification: {
    other: {
      "msvalidate.01": "DFE132ECE62D3F6AC2E582289D8C75EF",
      "yandex-verification": "0a5c19e07a126e5b",
    },
  },
  manifest: "/manifest.json",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://datalyst.one"),
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Datalyst",
    url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://datalyst.one",
    title: "Datalyst — Free Habit Tracker & Correlation Analysis",
    description: "Log daily habits. After 14 days, Datalyst runs real statistical analysis and shows what tends to move with your sleep, energy, and focus. Free.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Datalyst — Free Habit Tracker & Correlation Analysis",
    description: "Real statistics on your daily habits. Pearson correlations, p-values, and experiments, not just streaks.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Datalyst",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#121316",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${archivo.variable} ${inter.variable} ${geistMono.variable}`} suppressHydrationWarning>
        <NativeAuthCallback />
        <WebMcpTools />
        <ServiceWorkerRegister />
        {children}
        <CookieNotice />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "Datalyst",
              "description": "Habit tracker that runs real statistical correlations (Pearson, Spearman) to reveal what actually affects your sleep, energy, and focus.",
              "url": process.env.NEXT_PUBLIC_SITE_URL ?? "https://datalyst.one",
              "applicationCategory": "HealthAndFitnessApplication",
              "operatingSystem": "Web, iOS, Android",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "featureList": [
                "Habit tracking with custom variables",
                "Pearson and Spearman correlation analysis",
                "p-value statistical significance testing",
                "Interactive data visualizations"
              ]
            })
          }}
        />
      </body>
    </html>
  );
}
