import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { commandRoom, decodeAnswer, getRoom, projectRoom, type RoomCommand } from '@/lib/server/room-store';
import { checkOrigin, fail, json, viewerFor } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    checkOrigin(request);
    const { code } = await params;
    const room = await getRoom(code);
    if (!room) return fail(new Error('Không tìm thấy phòng thi.'), 404);
    const viewer = viewerFor(request, room);
    if (!viewer || viewer.role === 'display') return fail(new Error('Bạn không có quyền điều khiển phòng này.'), 403);
    const body = await request.json() as { command?: RoomCommand; commandId?: string; expectedRevision?: number };
    if (!body.command || !body.commandId || !Number.isInteger(body.expectedRevision)) return fail(new Error('Thiếu lệnh, mã thao tác hoặc phiên bản dữ liệu.'));
    const command = body.command;
    if (command.type === 'game' && command.action.type === 'answer') {
      const match = room.matches.find((item) => item.id === command.matchId);
      if (!match) return fail(new Error('Không tìm thấy trận đấu.'), 404);
      command.action.answerId = decodeAnswer(room, match, command.action.answerId);
    }
    const updated = await commandRoom(code, viewer, command, body.commandId || randomUUID(), body.expectedRevision!);
    return json(projectRoom(updated, viewer));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return fail(error, message.includes('Dữ liệu trận đã thay đổi') ? 409 : 400);
  }
}
