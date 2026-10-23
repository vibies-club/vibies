export const grantCookie = (secure: boolean) => `${secure ? '__Host-' : ''}vibies-google-grant`;

export function readCookies(request: Request) {
  const result = new Map<string,string>();
  for (const item of (request.headers.get('cookie') ?? '').split(';')) {
    const index = item.indexOf('=');
    if (index > 0) result.set(item.slice(0,index).trim(), item.slice(index+1).trim());
  }
  return result;
}

export function cookie(name: string, value: string, secure: boolean, maxAge: number) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function clearGoogleCookies(request: Request, response: Response, secure: boolean) {
  const names = new Set([grantCookie(secure), 'vibies-google.session_token', '__Secure-vibies-google.session_token',
    'vibies-google.oauth_state', '__Secure-vibies-google.oauth_state',
    'vibies-google.session_data', '__Secure-vibies-google.session_data',
    'vibies-google.account_data', '__Secure-vibies-google.account_data']);
  for (const name of readCookies(request).keys())
    if (name.startsWith('vibies-google.') || name.startsWith('__Secure-vibies-google.')) names.add(name);
  for (const name of names) response.headers.append('Set-Cookie',cookie(name,'',secure,0));
}
