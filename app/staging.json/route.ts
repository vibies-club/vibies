import { stagingIdentity } from "../../lib/staging.ts";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const identity = stagingIdentity();
  const headers = { "Cache-Control": "no-store" };
  if (!identity) return new Response(null, { status: 404, headers });
  const nonce = new URL(request.url).searchParams.get("nonce");
  if (!nonce || !/^[a-f0-9-]{16,64}$/.test(nonce)) {
    return new Response(null, { status: 400, headers });
  }
  return Response.json({ ...identity, nonce }, { headers });
}
