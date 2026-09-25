import { NextRequest } from 'next/server';
import { getRoom, roomTeamFromToken } from '@/lib/server/room-store';
import { checkOrigin, cookieSecure, fail, json } from '@/lib/server/http';

export const runtime = 'nodejs';

/** Restores a team's cookie from its saved room link, e.g. after a reload in another browser. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    checkOrigin(request);
    const { code } = await params;
    const body = await request.json() as { token?: string };
    const room = await getRoom(code);
    if (!room) return fail(new Error('Không tìm thấy phòng thi.'), 404);
    const team = roomTeamFromToken(room, body.token);
    if (!team) return fail(new Error('Liên kết đội không hợp lệ.'), 401);
    const response = json({ teamId: team.id });
    response.cookies.set(`arena_team_${room.code}`, body.token!, { httpOnly: true, sameSite: 'lax', secure: cookieSecure(request), path: '/', maxAge: 60 * 60 * 24 * 30 });
    return response;
  } catch (error) { return fail(error); }
}
