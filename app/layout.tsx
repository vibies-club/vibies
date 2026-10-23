import type { Metadata } from "next";
import localFont from "next/font/local";
import { stagingIdentity } from "../lib/staging";
import "./globals.css";

const display = localFont({ src: "./fonts/bricolage-grotesque.woff2", weight: "200 800", variable: "--font-display", display: "swap" });
const mono = localFont({ src: "./fonts/jetbrains-mono.woff2", weight: "100 800", variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Vibies | Build together",
  description: "A private community where beginners build together.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const staging = stagingIdentity();
  return <html lang="en" className={`${display.variable} ${mono.variable}`}><body>
    {staging && <aside className="staging-banner" aria-label="Staging version">
      Staging · Test content · <code title={staging.sha}>{staging.sha.slice(0, 7)}</code>
    </aside>}
    {children}
  </body></html>;
}
