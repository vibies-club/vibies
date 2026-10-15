import { googleRoute } from '../../../../../../lib/google-auth/server';
export async function GET(request:Request) { return googleRoute(request,'callback'); }
