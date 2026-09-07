import "server-only";
import { NextResponse } from "next/server";
import { origin } from "./access";
import { sameOriginPost } from "./access-core";

export function go(location: string) {
  return new NextResponse(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
export function safeError(status = 503) {
  return new Response("We could not complete this action. Please go back and try again.", {
    status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
export function allowedPost(request: Request) {
  try { return sameOriginPost(request, origin()); } catch { return false; }
}
