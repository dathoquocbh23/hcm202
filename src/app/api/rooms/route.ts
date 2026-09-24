import { NextRequest } from 'next/server';
import { createRoom, isAdminSession, listRooms } from '@/lib/server/room-store';
import { checkOrigin, fail, json } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!isAdminSession(request.cookies.get('arena_admin')?.value)) return fail(new Error('Cần đăng nhập Admin.'), 401);
  try { return json({ rooms: (await listRooms()).map((room) => ({ code: room.code, title: room.title, createdAt: room.createdAt, approved: room.teams.filter((team) => team.status === 'approved').length, active: room.matches.some((match) => match.status === 'active') })) }); }
  catch (error) { return fail(error, 500); }
}

export async function POST(request: NextRequest) {
  if (!isAdminSession(request.cookies.get('arena_admin')?.value)) return fail(new Error('Cần đăng nhập Admin.'), 401);
  try {
    checkOrigin(request);
    const body = await request.json() as { title?: string; practiceReuse?: boolean };
    const room = await createRoom(body.title ?? '', body.practiceReuse === true);
    return json({ code: room.code }, 201);
  } catch (error) { return fail(error); }
}
