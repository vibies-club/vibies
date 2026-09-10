import { cookies } from "next/headers";
import { cookieName, cookieOptions, database, githubConfig } from "../../../lib/access";
import { authorizationURL, digest, token, validToken } from "../../../lib/access-core";
import { allowedPost, go, safeError } from "../../../lib/access-http";

export async function POST(request: Request) {
  if (!allowedPost(request)) return safeError(403);
  const browser = (await cookies()).get(cookieName("browser"))?.value;
  if (!validToken(browser)) return go("/auth/browser");
  try {
    const config = githubConfig();
    const state = token();
    const verifier = token();
    const [row] = await database()`select vibies_private.begin_sign_in(${digest(browser)}, ${digest(state)}) as result`;
    if (row.result.kind !== "ok") return go(`/sign-in?message=${row.result.kind === "limited" ? "limited" : "unavailable"}`);
    const response = go(authorizationURL(config, state, verifier).toString());
    response.cookies.set(cookieName("oauth"), `${state}.${verifier}`, { ...cookieOptions(), maxAge: 600 });
    return response;
  } catch { return go("/sign-in?message=unavailable"); }
}
