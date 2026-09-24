import { NextRequest } from 'next/server';
import { getRoom, projectRoom, touchTeam } from '@/lib/server/room-store';
import { fail, json, viewerFor } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const room = await getRoom(code);
    if (!room) return fail(new Error('Không tìm thấy phòng thi.'), 404);
    const viewer = viewerFor(request, room);
    if (!viewer) return fail(new Error('Cần tham gia phòng hoặc đăng nhập Admin.'), 401);
    const current = viewer.role === 'team' ? await touchTeam(room, viewer.teamId) : room;
    return json(projectRoom(current, viewer));
  } catch (error) { return fail(error, 500); }
}
