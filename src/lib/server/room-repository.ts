import type { Room } from '../../features/game/types.ts';
import { supabaseRequest, SupabaseError } from './supabase-rest.ts';

interface StoredRoom { code: string; body: Room; version: number }
const fields = 'code,body,version';
const codeFilter = (code: string) => `code=eq.${encodeURIComponent(code.trim().toUpperCase())}`;

function normalize(record: StoredRoom): StoredRoom {
  record.body.processedCommands ??= [];
  return record;
}

async function readRecord(code: string): Promise<StoredRoom | null> {
  const rows = await supabaseRequest<StoredRoom[]>(`arena_rooms?select=${fields}&${codeFilter(code)}&limit=1`);
  return rows[0] ? normalize(rows[0]) : null;
}

export async function readStoredRoom(code: string): Promise<Room | null> {
  return (await readRecord(code))?.body ?? null;
}

export async function listStoredRooms(): Promise<Room[]> {
  const rooms: Room[] = [];
  // Follow actual page lengths, including projects with a low REST row limit.
  for (let offset = 0; ; ) {
    const rows = await supabaseRequest<StoredRoom[]>(`arena_rooms?select=${fields}&order=created_at.desc,code.asc&limit=100&offset=${offset}`);
    if (!rows.length) return rooms;
    rooms.push(...rows.map((record) => normalize(record).body));
    offset += rows.length;
  }
}

export async function insertStoredRoom(room: Room): Promise<boolean> {
  try {
    await supabaseRequest('arena_rooms', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ code: room.code, body: room, created_at: new Date(room.createdAt).toISOString() })
    });
    return true;
  } catch (error) {
    if (error instanceof SupabaseError && error.code === '23505') return false;
    throw error;
  }
}

/** Callbacks may run again on conflict; keep all effects inside the room object. */
export async function updateStoredRoom<T>(
  code: string,
  change: (room: Room) => { value: T; changed: boolean }
): Promise<{ room: Room; value: T }> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const record = await readRecord(code);
    if (!record) throw new Error('Không tìm thấy phòng thi.');
    const result = change(record.body);
    if (!result.changed) return { room: record.body, value: result.value };
    // The database evaluates this predicate atomically, across all Vercel instances.
    // A separate storage version protects heartbeats without invalidating UI commands.
    const saved = await supabaseRequest<{ code: string }[]>(
      `arena_rooms?${codeFilter(code)}&version=eq.${record.version}&select=code`,
      {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ body: record.body, version: record.version + 1 })
      }
    );
    if (saved.length === 1) return { room: record.body, value: result.value };
  }
  throw new Error('Dữ liệu trận đã thay đổi. Vui lòng đồng bộ và thử lại.');
}
