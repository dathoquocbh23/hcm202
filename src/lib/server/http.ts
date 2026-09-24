import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession, roomTeamFromToken, validDisplayToken } from './room-store';
import type { Room, Viewer } from '@/features/game/types';

export function fail(error: unknown, status = 400): NextResponse {
  const message = error instanceof Error ? error.message : 'Đã xảy ra lỗi. Vui lòng thử lại.';
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function checkOrigin(request: NextRequest): void {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host') ?? request.nextUrl.host;
  if (origin && new URL(origin).host !== host) throw new Error('Nguồn gửi yêu cầu không hợp lệ.');
}

export function viewerFor(request: NextRequest, room: Room): Viewer | null {
  if (isAdminSession(request.cookies.get('arena_admin')?.value)) return { role: 'admin' };
  const team = roomTeamFromToken(room, request.cookies.get(`arena_team_${room.code}`)?.value);
  if (team) return { role: 'team', teamId: team.id };
  if (validDisplayToken(room, request.nextUrl.searchParams.get('display'))) return { role: 'display' };
  return null;
}

export function json(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function cookieSecure(request: NextRequest): boolean { return request.nextUrl.protocol === 'https:'; }
