import { NextRequest } from 'next/server';
import { getRoom, projectRoom, touchTeam } from '@/lib/server/room-store';
import { fail, json, viewerFor } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const room = getRoom(code);
    if (!room) return fail(new Error('Không tìm thấy phòng thi.'), 404);
    const viewer = viewerFor(request, room);
    if (!viewer) return fail(new Error('Cần tham gia phòng hoặc đăng nhập Admin.'), 401);
    if (viewer.role === 'team') touchTeam(room.code, viewer.teamId);
    return json(projectRoom(getRoom(room.code)!, viewer));
  } catch (error) { return fail(error, 500); }
}
