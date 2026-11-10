import type { Metadata, Viewport } from "next";
import { Archivo, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { CookieNotice } from "@/components/ui/CookieNotice";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { NativeAuthCallback } from "@/components/auth/NativeAuthCallback";
import { WebMcpTools } from "@/components/agent/WebMcpTools";
import { BRAND, siteOrigin } from "@/lib/brand";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: BRAND.title,
  description: BRAND.description,
  keywords: ["symptom tracker", "habit tracker", "symptom and habit tracker", "health tracker", "migraine tracker", "sleep tracker", "mood tracker", "biohacking tracker", "biohacking app", "quantified self", "self experimentation", "personal health log"],
  authors: [{ name: "Datalyst" }],
  creator: "Datalyst",
  verification: {
    other: {
      "msvalidate.01": "DFE132ECE62D3F6AC2E582289D8C75EF",
      "yandex-verification": "0a5c19e07a126e5b",
    },
  },
  manifest: "/manifest.json",
  metadataBase: new URL(siteOrigin()),
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Datalyst",
    url: siteOrigin(),
    title: BRAND.title,
    description: BRAND.ogDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND.title,
    description: BRAND.tagline,
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
              "description": BRAND.shortPitch,
              "url": siteOrigin(),
              "applicationCategory": "HealthApplication",
              "operatingSystem": "Web, iOS, Android",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "featureList": [
                "Symptom logging",
                "Habit logging",
                "Correlations between habits and symptoms",
                "Personal history and charts",
                "Randomized personal experiments",
                "Biohacking and quantified self tracking"
              ]
            })
          }}
        />
      </body>
    </html>
  );
}
