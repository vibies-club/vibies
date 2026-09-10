import { cookies } from "next/headers";
import { cookieName, cookieOptions } from "../../../lib/access";
import { token, validToken } from "../../../lib/access-core";
import { go } from "../../../lib/access-http";

export async function GET() {
  const response = go("/sign-in");
  if (!validToken((await cookies()).get(cookieName("browser"))?.value)) {
    response.cookies.set(cookieName("browser"), token(), cookieOptions());
  }
  return response;
}
