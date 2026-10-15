import { googleRoute } from '../../../../lib/google-auth/server';
export async function POST(request:Request) { return googleRoute(request,'link'); }
