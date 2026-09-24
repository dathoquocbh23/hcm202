import { NextRequest } from 'next/server';
import { joinRoom } from '@/lib/server/room-store';
import { checkOrigin, cookieSecure, fail, json } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    checkOrigin(request);
    const { code } = await params;
    const body = await request.json() as { name?: string };
    const joined = joinRoom(code, body.name ?? '');
    const response = json({ code: joined.room.code, teamId: joined.team.id, status: joined.team.status }, 201);
    response.cookies.set(`arena_team_${joined.room.code}`, joined.token, { httpOnly: true, sameSite: 'lax', secure: cookieSecure(request), path: '/', maxAge: 60 * 60 * 24 * 30 });
    return response;
  } catch (error) { return fail(error); }
}
