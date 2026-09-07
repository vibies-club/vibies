import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vibies | Project demo",
  description: "A sample project stored in the Vibies demo database.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
