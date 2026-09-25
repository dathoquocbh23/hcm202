import assert from 'node:assert/strict';
import test, { afterEach, beforeEach, type TestContext } from 'node:test';
import { commandRoom, createRoom, getRoom, joinRoom, listRooms, projectRoom, touchTeam } from '../src/lib/server/room-store.ts';
import { supabaseRequest } from '../src/lib/server/supabase-rest.ts';
import { ANSWER_LATENCY_MS, createGame } from '../src/features/game/engine.ts';
import type { Room } from '../src/features/game/types.ts';

const envNames = ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_PASSWORD'] as const;
let original: (string | undefined)[];
beforeEach(() => {
  original = envNames.map((name) => process.env[name]);
  process.env.SUPABASE_URL = 'https://arena-test.supabase.co';
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_only';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.ADMIN_PASSWORD = 'test-only-admin-password';
});
afterEach(() => {
  envNames.forEach((name, index) => {
    if (original[index] === undefined) delete process.env[name];
    else process.env[name] = original[index];
  });
});

// Model PostgREST's atomic version predicate. Real database/RLS verification is
// separate; these tests exercise application races without Supabase credentials.
function database(t: TestContext) {
  const records = new Map<string, { code: string; body: Room; version: number }>();
  let conflicts = 0;
  let writes = 0;
  let pendingWrites = 0;
  let releaseWrites: (() => void) | undefined;
  let writeBarrier: Promise<void> | undefined;
  t.mock.method(globalThis, 'fetch', async (input: string, init: RequestInit) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://arena-test.supabase.co');
    assert.equal(url.pathname, '/rest/v1/arena_rooms');
    assert.equal(new Headers(init.headers).get('apikey'), 'sb_secret_test_only');
    assert.equal(new Headers(init.headers).has('Authorization'), false);
    assert.equal(init.cache, 'no-store');
    const code = url.searchParams.get('code')?.slice(3);
    if (init.method === 'POST') {
      const item = JSON.parse(init.body as string);
      if (records.has(item.code)) return Response.json({ code: '23505' }, { status: 409 });
      records.set(item.code, { ...item, version: 1 });
      writes++;
      return new Response(null, { status: 201 });
    }
    if (init.method === 'PATCH') {
      if (pendingWrites > 0) {
        pendingWrites--;
        if (pendingWrites === 0) releaseWrites!();
        await writeBarrier;
      }
      const record = records.get(code!);
      const version = Number(url.searchParams.get('version')?.slice(3));
      if (!record || record.version !== version) {
        conflicts++;
        return Response.json([]);
      }
      Object.assign(record, JSON.parse(init.body as string));
      writes++;
      return Response.json([{ code }]);
    }
    if (code) return Response.json(records.has(code) ? [records.get(code)] : []);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    // Deliberately impose a lower page limit than the caller requested.
    return Response.json([...records.values()].sort((a, b) => b.body.createdAt - a.body.createdAt || a.code.localeCompare(b.code)).slice(offset, offset + 2));
  });
  return {
    records, get conflicts() { return conflicts; }, get writes() { return writes; },
    raceNextWrites() {
      pendingWrites = 2;
      writeBarrier = new Promise<void>((resolve) => { releaseWrites = resolve; });
    }
  };
}

test('new rooms persist, normalize lookup codes, and list across REST pages', async (t) => {
  database(t);
  const rooms = await Promise.all(Array.from({ length: 5 }, (_, i) => createRoom(`Room ${i}`, true)));
  assert.equal((await listRooms()).length, 5);
  assert.deepEqual(await getRoom(` ${rooms[0].code.toLowerCase()} `), rooms[0]);
  assert.equal(await getRoom('ZZZZZZ'), null);
  assert.equal(rooms[0].sets[0].questions.length, 20);
});

test('simultaneous joins preserve both teams and reject a duplicate name', async (t) => {
  const db = database(t);
  const room = await createRoom('Concurrent joins', true);
  await Promise.all([joinRoom(room.code, 'Alpha'), joinRoom(room.code, 'Beta')]);
  assert.equal((await getRoom(room.code))!.teams.length, 2);
  assert.ok(db.conflicts > 0, 'test must actually produce a competing write');
  const duplicate = await Promise.allSettled([joinRoom(room.code, 'Gamma'), joinRoom(room.code, 'Gamma')]);
  assert.equal(duplicate.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await getRoom(room.code))!.teams.length, 3);
});

test('simultaneous duplicate commands apply once and stale admin commands fail', async (t) => {
  const db = database(t);
  const room = await createRoom('Commands', true);
  await Promise.all(Array.from({ length: 2 }, () => commandRoom(room.code, { role: 'admin' }, { type: 'lock-joins', locked: true }, 'duplicate-command', room.revision)));
  const saved = (await getRoom(room.code))!;
  assert.equal(saved.revision, room.revision + 1);
  assert.deepEqual(saved.processedCommands, ['duplicate-command']);
  assert.ok(db.conflicts > 0);
  await assert.rejects(commandRoom(room.code, { role: 'admin' }, { type: 'lock-joins', locked: false }, 'stale-command', room.revision), /Dữ liệu trận đã thay đổi/);
  assert.equal((await getRoom(room.code))!.joinLocked, true);
});

test('heartbeat and team commands do not overwrite each other', async (t) => {
  const db = database(t);
  const room = await createRoom('Heartbeat race', true);
  const joined = await joinRoom(room.code, 'Alpha');
  const record = db.records.get(room.code)!;
  record.body.teams[0].status = 'approved';
  record.body.teams[0].lastSeen = 0;
  const before = structuredClone(record.body);
  db.raceNextWrites();
  await Promise.all([
    touchTeam(before, joined.team.id),
    commandRoom(room.code, { role: 'team', teamId: joined.team.id }, { type: 'ready', ready: true }, 'ready-command', before.revision)
  ]);
  const saved = (await getRoom(room.code))!;
  assert.equal(saved.teams[0].ready, true);
  assert.ok(saved.teams[0].lastSeen > 0);
  assert.equal(saved.revision, before.revision + 1);
  assert.ok(db.conflicts > 0);
});

test('concurrent reads catch up expired deadlines once and leave paused matches alone', async (t) => {
  const db = database(t);
  const room = await createRoom('Deadline recovery', true);
  const game = createGame(room.sets[0], ['a', 'b'], Date.now() - 21_000);
  const paused = structuredClone(game);
  paused.paused = true;
  db.records.get(room.code)!.body.matches = [
    { id: 'active', round: 'semifinal-a', teamIds: ['a', 'b'], setId: room.sets[0].id, status: 'active', game },
    { id: 'paused', round: 'semifinal-b', teamIds: ['c', 'd'], setId: room.sets[0].id, status: 'active', game: paused }
  ];
  const results = await Promise.all([getRoom(room.code), getRoom(room.code)]);
  const saved = results[1]!;
  assert.equal(saved.matches[0].game!.phase, 'attack-skill');
  assert.deepEqual(saved.matches[1].game, paused);
  assert.equal(saved.revision, room.revision + 1);
  assert.ok(db.conflicts > 0);
  const writes = db.writes;
  await getRoom(room.code);
  assert.equal(db.writes, writes, 'polling must not write before a deadline');
  const view = JSON.parse(JSON.stringify(projectRoom(saved, { role: 'display' })));
  assert.equal(view.sets, undefined);
  assert.equal(view.displayTokenHash, undefined);
  assert.equal(view.matches[0].game.private, undefined);
  assert.equal(view.matches[0].game.correctAnswer, null);
});

test('independent matches accept simultaneous actions with the same room revision', async (t) => {
  const db = database(t);
  const room = await createRoom('Two semifinals', true);
  db.records.get(room.code)!.body.matches = [
    { id: 'first', round: 'semifinal-a', teamIds: ['a', 'b'], setId: room.sets[0].id, status: 'active', game: createGame(room.sets[0], ['a', 'b'], Date.now()) },
    { id: 'second', round: 'semifinal-b', teamIds: ['c', 'd'], setId: room.sets[0].id, status: 'active', game: createGame(room.sets[0], ['c', 'd'], Date.now()) }
  ];
  await Promise.all(['first', 'second'].map((matchId) => commandRoom(room.code, { role: 'admin' }, { type: 'game', matchId, action: { type: 'pause' } }, `pause-${matchId}`, room.revision)));
  const saved = (await getRoom(room.code))!;
  assert.ok(saved.matches.every((match) => match.game!.paused));
  assert.equal(saved.revision, room.revision + 2);
  assert.ok(db.conflicts > 0);
});

test('public URL variable works when the server URL variable is absent', async (t) => {
  database(t);
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  assert.equal(await getRoom('ABCDEF'), null);
});

test('100 simultaneous viewers catch up one expired room without duplicate writes', async (t) => {
  const db = database(t);
  const room = await createRoom('Viewer burst', true);
  db.records.get(room.code)!.body.matches = [
    { id: 'burst', round: 'semifinal-a', teamIds: ['a', 'b'], setId: room.sets[0].id, status: 'active', game: createGame(room.sets[0], ['a', 'b'], Date.now() - 21_000) }
  ];
  const before = db.writes;
  const results = await Promise.all(Array.from({ length: 100 }, () => getRoom(room.code)));
  assert.ok(results.every((item) => item?.matches[0].game?.phase === 'attack-skill'));
  assert.equal(db.writes - before, 1);
  t.diagnostic(`100 reads succeeded; ${db.conflicts} conflicting writes retried; one deadline update committed. REST is mocked.`);
});

test('50 simultaneous joins preserve successful writes and report contention explicitly', async (t) => {
  const db = database(t);
  const room = await createRoom('Join burst', true);
  const results = await Promise.allSettled(Array.from({ length: 50 }, (_, index) => joinRoom(room.code, `Team ${index}`)));
  const successful = results.filter((item) => item.status === 'fulfilled');
  const rejected = results.filter((item) => item.status === 'rejected');
  const saved = (await getRoom(room.code))!;
  assert.equal(saved.teams.length, successful.length);
  assert.equal(new Set(saved.teams.map((item) => item.name)).size, successful.length);
  for (const item of rejected) assert.match(String(item.reason), /Dữ liệu trận đã thay đổi/);
  t.diagnostic(`50 simultaneous joins: ${successful.length} succeeded, ${rejected.length} exhausted retries, ${db.conflicts} conflicts; no successful joins lost. REST is mocked.`);
});

test('missing configuration fails without trying the network', async (t) => {
  delete process.env.SUPABASE_SECRET_KEY;
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network'); });
  await assert.rejects(getRoom('ABCDEF'), /Thiếu SUPABASE_URL.*SUPABASE_SECRET_KEY/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('database errors do not expose private data or key values', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ code: 'PGRST205', message: 'private-answer-and-secret' }, { status: 404 }));
  await assert.rejects(supabaseRequest('arena_rooms'), (error: Error) => {
    assert.match(error.message, /001_arena_rooms.sql/);
    assert.doesNotMatch(error.message, /private-answer-and-secret|sb_secret_test_only/);
    return true;
  });
});

test('finished semifinals fill the final, which starts only after the invitation and both teams are ready', async (t) => {
  const db = database(t);
  const room = await createRoom('Final pairing', true);
  const body = db.records.get(room.code)!.body;
  body.teams = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase(), color: 'red', status: 'approved', ready: true, tokenHash: id, lastSeen: 0, joinedAt: 0 }));
  // Each semifinal sits in an expired answer phase that knocks out its defender on timeout.
  const nearlyOver = (ids: [string, string]) => {
    const game = createGame(room.sets[0], ids, Date.now() - 60_000);
    game.phase = 'answer';
    game.activeQuestionId = game.candidates[0];
    game.phaseDeadline = Date.now() - ANSWER_LATENCY_MS - 1;
    game.hp[game.defenderId] = 60;
    return game;
  };
  body.matches = [
    { id: 'semi-a', round: 'semifinal-a', teamIds: ['a', 'b'], setId: room.sets[0].id, status: 'active', game: nearlyOver(['a', 'b']) },
    { id: 'semi-b', round: 'semifinal-b', teamIds: ['c', 'd'], setId: room.sets[0].id, status: 'active', game: nearlyOver(['c', 'd']) },
    { id: 'final', round: 'final', teamIds: null, setId: room.sets[0].id, status: 'pending', game: null }
  ];
  const saved = (await getRoom(room.code))!;
  const [first, second, final] = saved.matches;
  assert.equal(first.status, 'completed');
  assert.equal(second.status, 'completed');
  assert.deepEqual(final.teamIds, [first.game!.winnerId, second.game!.winnerId]);
  assert.ok(final.teamIds!.every((id) => !saved.teams.find((team) => team.id === id)!.ready));
  await assert.rejects(commandRoom(room.code, { role: 'admin' }, { type: 'start-match', matchId: 'final' }, 'start-early', saved.revision), /Cả hai đội cần báo sẵn sàng/);
  const invited = await commandRoom(room.code, { role: 'admin' }, { type: 'invite-final', matchId: 'final' }, 'invite-final', saved.revision);
  assert.ok(invited.matches[2].invitedAt);
  let ready = invited;
  for (const teamId of final.teamIds!) ready = await commandRoom(room.code, { role: 'team', teamId }, { type: 'ready', ready: true }, `ready-final-${teamId}`, ready.revision);
  const started = await commandRoom(room.code, { role: 'admin' }, { type: 'start-match', matchId: 'final' }, 'start-final', ready.revision);
  assert.equal(started.matches[2].status, 'active');
  const view = JSON.parse(JSON.stringify(projectRoom(saved, { role: 'display' })));
  assert.equal(view.matches[0].game.lastAnswer.outcome, 'timeout');
  assert.equal(view.matches[0].game.lastAnswer.known, true);
  assert.ok(view.matches[0].game.lastAnswer.correctAnswer);
  assert.equal(view.matches[0].game.review.length, 1);
});

test('new rooms carry all three sets and the official bracket gives each match its own set', async (t) => {
  const db = database(t);
  const room = await createRoom('Three sets', false);
  assert.deepEqual(room.sets.map((set) => set.id), ['hcm-independence-sample', 'hcm-bo-2-ban-ket-b', 'hcm-bo-3-chung-ket']);
  db.records.get(room.code)!.body.teams = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase(), color: 'red', status: 'approved', ready: false, tokenHash: id, lastSeen: 0, joinedAt: 0 }));
  const drawn = await commandRoom(room.code, { role: 'admin' }, { type: 'create-bracket' }, 'draw-bracket', room.revision);
  assert.deepEqual(drawn.matches.map((match) => match.setId), room.sets.map((set) => set.id));
});
