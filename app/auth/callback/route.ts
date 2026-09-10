import { cookies } from "next/headers";
import { cookieName, cookieOptions, database, githubConfig, sessionHash } from "../../../lib/access";
import { digest, exchangeGitHub, token, validToken } from "../../../lib/access-core";
import { go } from "../../../lib/access-http";

export async function GET(request: Request) {
  const jar = await cookies();
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const browser = jar.get(cookieName("browser"))?.value;
  const oauth = jar.get(cookieName("oauth"))?.value?.split(".");
  const done = (path: string) => {
    const response = go(path);
    response.cookies.set(cookieName("oauth"), "", { ...cookieOptions(), maxAge: 0 });
    return response;
  };
  if (!validToken(state) || !validToken(browser) || oauth?.length !== 2 ||
      oauth[0] !== state || !validToken(oauth[1])) return done("/sign-in?message=failed");
  try {
    const [flow] = await database()`select vibies_private.consume_sign_in(${digest(browser)}, ${digest(state)}) as result`;
    if (!flow.result) return done("/sign-in?message=failed");
    if (params.get("error") === "access_denied") return done("/sign-in");
    const code = params.get("code");
    if (params.has("error") || !code || code.length > 1024) return done("/sign-in?message=failed");
    const account = await exchangeGitHub(githubConfig(), code, oauth[1]);
    const session = token();
    const previous = await sessionHash();
    await database()`select vibies_private.finish_sign_in(${account.githubId}, ${account.username}, ${digest(session)}, ${previous})`;
    const response = done("/welcome");
    response.cookies.set(cookieName("session"), session, { ...cookieOptions(), maxAge: 86400 });
    return response;
  } catch { return done("/sign-in?message=failed"); }
}
