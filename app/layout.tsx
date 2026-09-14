import type { Metadata } from "next";
import { stagingIdentity } from "../lib/staging";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vibies | Build together",
  description: "A private community where beginners build together.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const staging = stagingIdentity();
  return <html lang="en"><body>
    {staging && <aside className="staging-banner" aria-label="Staging version">
      Staging · Test content · <code title={staging.sha}>{staging.sha.slice(0, 7)}</code>
    </aside>}
    {children}
  </body></html>;
}
