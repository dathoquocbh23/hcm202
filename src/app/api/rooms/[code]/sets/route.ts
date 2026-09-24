import { NextRequest } from 'next/server';
import { getRoom, isAdminSession } from '@/lib/server/room-store';
import { fail, json } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (!isAdminSession(request.cookies.get('arena_admin')?.value)) return fail(new Error('Cần đăng nhập Admin.'), 401);
  try {
    const { code } = await params;
    const room = await getRoom(code);
    if (!room) return fail(new Error('Không tìm thấy phòng thi.'), 404);
    return json({ sets: room.sets });
  } catch (error) { return fail(error, 500); }
}
