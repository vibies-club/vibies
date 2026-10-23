import type { Metadata } from "next";
import localFont from "next/font/local";
import { ErrorsScreen } from "./errors-screen";
import "./errors.css";

const display = localFont({ src: "../fonts/bricolage-grotesque.woff2", weight: "200 800", variable: "--font-display", display: "swap" });
const mono = localFont({ src: "../fonts/jetbrains-mono.woff2", weight: "100 800", variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Common errors | Vibies demo",
  description: "Five sample class errors with clear steps to get back to building.",
};

export default async function ErrorsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const state = params.state === "loading" ? "loading" : params.state === "error" ? "error" : "results";
  const query = typeof params.q === "string" ? params.q : "";
  return <div className={`errors-app ${display.variable} ${mono.variable}`}>
    <ErrorsScreen key={`${state}:${query}`} initialState={state} initialQuery={query} />
  </div>;
}
