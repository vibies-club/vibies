import { cookieName, cookieOptions, database, sessionHash } from "../../../lib/access";
import { allowedPost, go, safeError } from "../../../lib/access-http";

export async function POST(request: Request) {
  if (!allowedPost(request)) return safeError(403);
  const response = go("/sign-in?message=signedout");
  response.cookies.set(cookieName("session"), "", { ...cookieOptions(), maxAge: 0 });
  response.cookies.set(cookieName("oauth"), "", { ...cookieOptions(), maxAge: 0 });
  try {
    const hash = await sessionHash();
    if (hash) await database()`select vibies_private.end_session(${hash})`;
    return response;
  } catch {
    // End this browser's session even when the database cannot finish cleanup.
    const failure = safeError();
    for (const cookie of response.headers.getSetCookie()) failure.headers.append("Set-Cookie", cookie);
    return failure;
  }
}
