import { NextRequest } from 'next/server';
import { adminConfigured, adminLoginValid, adminSessionValue, isAdminSession } from '@/lib/server/room-store';
import { checkOrigin, cookieSecure, fail, json } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return json({ configured: adminConfigured(), authenticated: isAdminSession(request.cookies.get('arena_admin')?.value) });
}

export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    if (!adminConfigured()) return fail(new Error('Hãy đặt ADMIN_PASSWORD trong .env.local rồi khởi động lại máy chủ.'), 503);
    const body = await request.json() as { password?: string };
    if (!body.password || !adminLoginValid(body.password)) return fail(new Error('Mật khẩu Admin không đúng.'), 401);
    const response = json({ authenticated: true });
    response.cookies.set('arena_admin', adminSessionValue(), { httpOnly: true, sameSite: 'lax', secure: cookieSecure(request), path: '/', maxAge: 60 * 60 * 24 * 7 });
    return response;
  } catch (error) { return fail(error); }
}

export async function DELETE(request: NextRequest) {
  try { checkOrigin(request); const response = json({ authenticated: false }); response.cookies.delete('arena_admin'); return response; }
  catch (error) { return fail(error); }
}
