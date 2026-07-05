import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Titlebar } from "@/components/layout/Titlebar";
import { DynamicTitle } from "@/components/DynamicTitle";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false, // Only preload main font, load mono font when needed
});

export const metadata: Metadata = {
  title: "daax.dev",
  description:
    "Developer and Agent eXperience - Development workbench with integrated terminal, AI coding tools, and code editor",
  // Next auto-injects <link rel="manifest"> from app/manifest.ts; appleWebApp
  // makes the app installable to the iOS home screen in standalone mode (#156).
  appleWebApp: {
    capable: true,
    title: "daax",
    statusBarStyle: "black-translucent",
  },
};

// theme-color + viewport-fit=cover give a proper standalone/notch experience on
// mobile once installed (#156).
export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background`}
      >
        <Providers>
          <ServiceWorkerRegister />
          <DynamicTitle />
          <div className="relative flex min-h-screen flex-col">
            <Titlebar />
            <main className="flex-1">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
