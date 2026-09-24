import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { advanceGame, actGame, createGame } from '@/features/game/engine';
import sampleJson from '@/features/game/data/sample-set.json';
import { skillById } from '@/features/game/skills';
import { validateQuestionSet } from '@/features/game/validate-set';
import type { GameCommand, GameState, Match, QuestionSet, Room, Team, Viewer } from '@/features/game/types';

const sampleSet = sampleJson as unknown as QuestionSet;
const palette: Team['color'][] = ['red', 'yellow', 'green', 'blue'];
const scope = globalThis as typeof globalThis & { __arenaDb?: DatabaseSync; __arenaTimer?: ReturnType<typeof setInterval> };

function db(): DatabaseSync {
  if (!scope.__arenaDb) {
    const file = path.join(process.cwd(), 'data', 'arena.sqlite');
    mkdirSync(path.dirname(file), { recursive: true });
    const opened = new DatabaseSync(file);
    opened.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, body TEXT NOT NULL);');
    scope.__arenaDb = opened;
  }
  if (!scope.__arenaTimer) {
    scope.__arenaTimer = setInterval(() => {
      try { tickAllRooms(); } catch (error) { console.error('Arena timer failed', error); }
    }, 1000);
    scope.__arenaTimer.unref();
  }
  return scope.__arenaDb;
}

function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function equal(a: string, b: string): boolean {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 12 && process.env.ADMIN_PASSWORD !== 'replace-with-a-long-random-password');
}

export function adminLoginValid(password: string): boolean {
  return adminConfigured() && equal(hash(password), hash(process.env.ADMIN_PASSWORD!));
}

export function adminSessionValue(): string {
  return createHmac('sha256', process.env.ADMIN_PASSWORD ?? '').update('arena-admin-session-v1').digest('hex');
}

export function isAdminSession(cookie: string | undefined): boolean {
  return adminConfigured() && Boolean(cookie && equal(cookie, adminSessionValue()));
}

function displayToken(code: string): string {
  return createHmac('sha256', process.env.ADMIN_PASSWORD ?? '').update(`arena-display:${code}`).digest('hex').slice(0, 32);
}

export function validDisplayToken(room: Room, token: string | null): boolean {
  return Boolean(token && equal(room.displayTokenHash, hash(token)));
}

export function adminDisplayToken(room: Room): string { return displayToken(room.code); }

function row(code: string): Room | null {
  const record = db().prepare('SELECT body FROM rooms WHERE code = ?').get(code) as { body: string } | undefined;
  if (!record) return null;
  const room = JSON.parse(record.body) as Room;
  room.processedCommands ??= [];
  return room;
}

function write(room: Room): void {
  db().prepare('INSERT INTO rooms (code, body) VALUES (?, ?) ON CONFLICT(code) DO UPDATE SET body=excluded.body').run(room.code, JSON.stringify(room));
}

export function getRoom(code: string): Room | null {
  const normalized = code.trim().toUpperCase();
  tickRoom(normalized);
  return row(normalized);
}

export function listRooms(): Room[] {
  tickAllRooms();
  return (db().prepare('SELECT body FROM rooms ORDER BY rowid DESC').all() as { body: string }[]).map((record) => JSON.parse(record.body) as Room);
}

function freshCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = Array.from(randomBytes(6), (byte) => alphabet[byte % alphabet.length]).join('');
    if (!row(code)) return code;
  }
  throw new Error('Không tạo được mã phòng. Vui lòng thử lại.');
}

export function createRoom(title: string, practiceReuse: boolean): Room {
  if (!adminConfigured()) throw new Error('Hãy cấu hình ADMIN_PASSWORD trước khi tạo giải đấu.');
  const clean = title.trim();
  if (clean.length < 3 || clean.length > 80) throw new Error('Tên giải đấu cần từ 3 đến 80 ký tự.');
  const code = freshCode();
  const room: Room = {
    code, title: clean, createdAt: Date.now(), joinLocked: false, practiceReuse,
    teams: [], matches: [], sets: [sampleSet], events: [], revision: 1,
    displayTokenHash: hash(displayToken(code)), processedCommands: []
  };
  write(room);
  return room;
}

export function roomTeamFromToken(room: Room, token: string | undefined): Team | null {
  if (!token) return null;
  const tokenHash = hash(token);
  return room.teams.find((team) => equal(team.tokenHash, tokenHash)) ?? null;
}

export function joinRoom(code: string, name: string): { room: Room; team: Team; token: string } {
  const cleanName = name.trim().replace(/\s+/g, ' ');
  if (cleanName.length < 2 || cleanName.length > 36) throw new Error('Tên đội cần từ 2 đến 36 ký tự.');
  const token = randomBytes(32).toString('hex');
  const team = mutateRoom(code, (room) => {
    if (room.joinLocked) throw new Error('Phòng đã khóa nhận đội mới.');
    if (room.teams.some((item) => item.name.normalize('NFC').toLocaleLowerCase('vi') === cleanName.normalize('NFC').toLocaleLowerCase('vi') && item.status !== 'rejected')) throw new Error('Tên đội đã được sử dụng.');
    if (room.teams.filter((item) => item.status === 'approved').length >= 4) throw new Error('Phòng đã đủ bốn đội.');
    const item: Team = { id: randomUUID(), name: cleanName, color: palette[room.teams.filter((t) => t.status === 'approved').length % 4], status: 'pending', ready: false, tokenHash: hash(token), lastSeen: Date.now(), joinedAt: Date.now() };
    room.teams.push(item);
    room.events.push({ id: randomUUID(), at: Date.now(), turn: 0, type: 'join', text: `${cleanName} gửi yêu cầu tham gia.`, teamId: item.id });
    return item;
  });
  const room = getRoom(code)!;
  return { room, team, token };
}

function mutateRoom<T>(code: string, action: (room: Room) => T, commandId?: string, expectedRevision?: number): T {
  const store = db();
  store.exec('BEGIN IMMEDIATE');
  try {
    const room = row(code.trim().toUpperCase());
    if (!room) throw new Error('Không tìm thấy phòng thi.');
    if (commandId && room.processedCommands.includes(commandId)) {
      store.exec('COMMIT');
      return undefined as T;
    }
    if (expectedRevision !== undefined && room.revision !== expectedRevision) throw new Error('Dữ liệu trận đã thay đổi. Vui lòng đồng bộ và thử lại.');
    const result = action(room);
    room.revision++;
    if (commandId) room.processedCommands = [...room.processedCommands, commandId].slice(-300);
    write(room);
    store.exec('COMMIT');
    return result;
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
}

function finishMatchInRoom(room: Room, match: Match, at: number): void {
  if (match.status !== 'active' || match.game?.phase !== 'completed') return;
  match.status = 'completed';
  room.events.push({ id: randomUUID(), at, turn: match.game.turn, type: 'match-completed', text: `${labelRound(match.round)} hoàn tất.`, teamId: match.game.winnerId ?? undefined });
  const first = room.matches.find((item) => item.round === 'semifinal-a');
  const second = room.matches.find((item) => item.round === 'semifinal-b');
  const final = room.matches.find((item) => item.round === 'final');
  if (first?.status === 'completed' && second?.status === 'completed' && final && !final.teamIds) {
    final.teamIds = [first.game!.winnerId!, second.game!.winnerId!];
    for (const id of final.teamIds) {
      const team = room.teams.find((item) => item.id === id);
      if (team) team.ready = false;
    }
    room.events.push({ id: randomUUID(), at, turn: 0, type: 'finalists', text: 'Hai đội vào chung kết đã được xác định.' });
  }
}

function tickRoom(code: string): void {
  const current = row(code);
  if (!current?.matches.some((match) => match.status === 'active' && match.game && !match.game.paused && match.game.phaseDeadline !== null && match.game.phaseDeadline <= Date.now())) return;
  mutateRoom(code, (room) => {
    const at = Date.now();
    for (const match of room.matches) {
      if (match.status === 'active' && match.game?.phaseDeadline !== null && !match.game?.paused) {
        match.game = advanceGame(match.game!, questionSetFor(room, match), at);
        finishMatchInRoom(room, match, at);
      }
    }
  });
}

function tickAllRooms(): void {
  const codes = (db().prepare('SELECT code FROM rooms').all() as { code: string }[]).map((item) => item.code);
  for (const code of codes) tickRoom(code);
}

export function questionSetFor(room: Room, match: Match): QuestionSet {
  const set = room.sets.find((item) => item.id === match.setId);
  if (!set) throw new Error('Trận chưa được gán bộ câu hỏi hợp lệ.');
  return set;
}

export function labelRound(round: Match['round']): string {
  return round === 'semifinal-a' ? 'Bán kết A' : round === 'semifinal-b' ? 'Bán kết B' : 'Chung kết';
}

function requireAdmin(viewer: Viewer): void { if (viewer.role !== 'admin') throw new Error('Chỉ Admin được thực hiện thao tác này.'); }

export type RoomCommand =
  | { type: 'approve' | 'reject'; teamId: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'create-bracket' }
  | { type: 'start-match'; matchId: string }
  | { type: 'lock-joins'; locked: boolean }
  | { type: 'import-set'; value: unknown }
  | { type: 'assign-set'; matchId: string; setId: string }
  | { type: 'game'; matchId: string; action: GameCommand; expected?: { turn: number; phase: GameState['phase'] } };

export function commandRoom(code: string, viewer: Viewer, command: RoomCommand, commandId: string, expectedRevision: number): Room {
  if (!/^[\w-]{8,100}$/.test(commandId)) throw new Error('Thiếu mã thao tác hợp lệ.');
  const current = getRoom(code);
  if (!current) throw new Error('Không tìm thấy phòng thi.');
  if (current.processedCommands.includes(commandId)) return current;
  // Game actions are checked against their own match (turn + phase) so two concurrent
  // matches, and the timer ticks they cause, do not invalidate each other's clicks.
  // "ready" carries the desired state, so it is safe to apply on any revision.
  const roomScoped = command.type !== 'game' && command.type !== 'ready';
  mutateRoom(code, (room) => {
    const at = Date.now();
    switch (command.type) {
      case 'approve': case 'reject': {
        requireAdmin(viewer);
        if (room.matches.length) throw new Error('Không thể đổi danh sách đội sau khi chia bảng.');
        const team = room.teams.find((item) => item.id === command.teamId && item.status === 'pending');
        if (!team) throw new Error('Không tìm thấy yêu cầu đang chờ.');
        if (command.type === 'approve' && room.teams.filter((item) => item.status === 'approved').length >= 4) throw new Error('Phòng đã đủ bốn đội.');
        team.status = command.type === 'approve' ? 'approved' : 'rejected';
        if (team.status === 'approved') team.color = palette[room.teams.filter((item) => item.status === 'approved').length - 1];
        room.events.push({ id: randomUUID(), at, turn: 0, type: command.type, text: `${team.name} ${command.type === 'approve' ? 'được duyệt' : 'bị từ chối'}.`, teamId: team.id });
        break;
      }
      case 'ready': {
        if (viewer.role !== 'team') throw new Error('Chỉ đội có thể thay đổi trạng thái sẵn sàng.');
        const team = room.teams.find((item) => item.id === viewer.teamId && item.status === 'approved');
        if (!team) throw new Error('Đội chưa được duyệt.');
        if (room.matches.some((item) => item.status === 'active' && item.teamIds?.includes(team.id))) throw new Error('Đội đang thi đấu.');
        team.ready = command.ready;
        room.events.push({ id: randomUUID(), at, turn: 0, type: 'ready', text: `${team.name} ${team.ready ? 'đã sẵn sàng' : 'chưa sẵn sàng'}.`, teamId: team.id });
        break;
      }
      case 'create-bracket': {
        requireAdmin(viewer);
        if (room.matches.length) throw new Error('Sơ đồ giải đã được tạo.');
        const approved = room.teams.filter((item) => item.status === 'approved');
        if (approved.length !== 4) throw new Error('Cần duyệt đủ bốn đội trước khi chia bảng.');
        const ordered = [...approved];
        for (let index = ordered.length - 1; index > 0; index--) {
          const other = Math.floor(Math.random() * (index + 1));
          [ordered[index], ordered[other]] = [ordered[other], ordered[index]];
        }
        const defaultSet = room.sets[0].id;
        room.matches = [
          { id: randomUUID(), round: 'semifinal-a', teamIds: [ordered[0].id, ordered[1].id], setId: defaultSet, status: 'pending', game: null },
          { id: randomUUID(), round: 'semifinal-b', teamIds: [ordered[2].id, ordered[3].id], setId: room.practiceReuse ? defaultSet : null, status: 'pending', game: null },
          { id: randomUUID(), round: 'final', teamIds: null, setId: room.practiceReuse ? defaultSet : null, status: 'pending', game: null }
        ];
        room.joinLocked = true;
        room.events.push({ id: randomUUID(), at, turn: 0, type: 'bracket', text: 'Đã bốc thăm chia hai trận bán kết.' });
        break;
      }
      case 'start-match': {
        requireAdmin(viewer);
        const match = room.matches.find((item) => item.id === command.matchId);
        if (!match || match.status !== 'pending' || !match.teamIds) throw new Error('Trận chưa sẵn sàng để bắt đầu.');
        if (room.matches.some((item) => item.status === 'active' && item.teamIds?.some((id) => match.teamIds!.includes(id)))) throw new Error('Một đội của trận này đang thi đấu ở trận khác.');
        if (!match.teamIds.every((id) => room.teams.find((team) => team.id === id)?.ready)) throw new Error('Cả hai đội cần báo sẵn sàng.');
        if (match.round === 'final' && room.matches.some((item) => item.round !== 'final' && item.status !== 'completed')) throw new Error('Cần kết thúc cả hai trận bán kết.');
        match.game = createGame(questionSetFor(room, match), match.teamIds, at);
        match.status = 'active';
        room.events.push({ id: randomUUID(), at, turn: 0, type: 'start-match', text: `${labelRound(match.round)} bắt đầu.` });
        break;
      }
      case 'lock-joins':
        requireAdmin(viewer);
        if (room.matches.length && !command.locked) throw new Error('Không thể mở nhận đội mới sau khi chia bảng.');
        room.joinLocked = command.locked;
        break;
      case 'import-set': {
        requireAdmin(viewer);
        const validated = validateQuestionSet(command.value);
        if (!validated.value) throw new Error(validated.errors.join(' '));
        if (room.sets.some((item) => item.id === validated.value!.id)) throw new Error('ID bộ câu hỏi đã tồn tại.');
        room.sets.push(validated.value);
        break;
      }
      case 'assign-set': {
        requireAdmin(viewer);
        const match = room.matches.find((item) => item.id === command.matchId && item.status === 'pending');
        if (!match || !room.sets.some((item) => item.id === command.setId)) throw new Error('Trận hoặc bộ câu hỏi không hợp lệ.');
        if (!room.practiceReuse && room.matches.some((item) => item.id !== match.id && item.setId === command.setId)) throw new Error('Bộ câu hỏi đã gán cho trận khác. Bật chế độ chơi thử nếu muốn dùng lại.');
        match.setId = command.setId;
        break;
      }
      case 'game': {
        const match = room.matches.find((item) => item.id === command.matchId && item.status === 'active' && item.game);
        if (!match?.game) throw new Error('Trận chưa bắt đầu hoặc đã kết thúc.');
        if (viewer.role === 'display') throw new Error('Màn hình khán giả chỉ được theo dõi.');
        const actor = viewer.role === 'admin' ? 'admin' : viewer.teamId;
        const set = questionSetFor(room, match);
        const current = advanceGame(match.game, set, at);
        if (command.expected && (current.turn !== command.expected.turn || current.phase !== command.expected.phase)) throw new Error('Dữ liệu trận đã thay đổi. Vui lòng đồng bộ và thử lại.');
        match.game = actGame(current, set, actor, command.action, at);
        finishMatchInRoom(room, match, at);
        break;
      }
    }
  }, commandId, roomScoped ? expectedRevision : undefined);
  return getRoom(code)!;
}

export function touchTeam(code: string, teamId: string): void {
  const room = row(code);
  const team = room?.teams.find((item) => item.id === teamId);
  if (!room || !team || Date.now() - team.lastSeen < 5000) return;
  const store = db();
  store.exec('BEGIN IMMEDIATE');
  try {
    const fresh = row(code);
    const actual = fresh?.teams.find((item) => item.id === teamId);
    if (fresh && actual) { actual.lastSeen = Date.now(); write(fresh); }
    store.exec('COMMIT');
  } catch (error) { store.exec('ROLLBACK'); throw error; }
}

function answerToken(matchId: string, internalId: string): string {
  return hash(`${matchId}:${internalId}`).slice(0, 16);
}

export function decodeAnswer(room: Room, match: Match, token: string): string {
  const set = questionSetFor(room, match);
  if (['A', 'B', 'C'].includes(token)) return token;
  const card = [...set.answers, ...set.decoys].find((item) => answerToken(match.id, item.id) === token);
  if (!card) throw new Error('Không tìm thấy thẻ đáp án đã chọn.');
  return card.id;
}

export function projectRoom(room: Room, viewer: Viewer) {
  const at = Date.now();
  return {
    code: room.code, title: room.title, joinLocked: room.joinLocked, practiceReuse: room.practiceReuse, revision: room.revision,
    viewer, serverTime: at,
    displayToken: viewer.role === 'admin' ? adminDisplayToken(room) : undefined,
    teams: room.teams.filter((team) => viewer.role === 'admin' || team.status === 'approved' || viewer.role === 'team' && team.id === viewer.teamId).map((team) => ({ id: team.id, name: team.name, color: team.color, status: team.status, ready: team.ready, online: at - team.lastSeen < 30_000, lastSeen: team.lastSeen })),
    matches: room.matches.map((match) => ({ id: match.id, round: match.round, teamIds: match.teamIds, setId: viewer.role === 'admin' ? match.setId : undefined, status: match.status, game: match.game ? projectGame(room, match, viewer) : null })),
    sets: viewer.role === 'admin' ? room.sets.map((set) => ({ id: set.id, title: set.title, reviewStatus: set.reviewStatus })) : undefined,
    events: viewer.role === 'admin' ? room.events.slice(-30) : undefined
  };
}

function projectGame(room: Room, match: Match, viewer: Viewer) {
  const game = match.game!;
  const set = questionSetFor(room, match);
  const question = set.questions.find((q) => q.id === game.activeQuestionId);
  const answerCards = [...game.answerBoard, ...game.activeDecoys].filter((id) => !game.removedAnswers.includes(id)).map((id) => {
    const card = set.answers.find((a) => a.id === id) ?? set.decoys.find((d) => d.id === id);
    return { id: answerToken(match.id, id), text: card?.text ?? '' };
  });
  const reveal = game.answerCorrect !== null || game.phase === 'completed';
  const playedHint = Boolean(game.defenseSkill?.kind === 'hint' && game.defenseSkill.id !== game.cancelledSkillId && ['answer', 'second-answer', 'reveal', 'reward', 'steal-cancel', 'overflow', 'completed'].includes(game.phase));
  const ownTeam = viewer.role === 'team' && game.teamIds.includes(viewer.teamId) ? viewer.teamId : null;
  return {
    phase: game.phase, phaseDeadline: game.phaseDeadline, paused: game.paused, pausedRemainingMs: game.pausedRemainingMs,
    turn: game.turn, attackerId: game.attackerId, defenderId: game.defenderId,
    hp: game.hp, handCounts: Object.fromEntries(game.teamIds.map((id) => [id, game.hands[id].length])),
    questionDeckCount: game.questionDeck.length, skillDeckCount: game.skillDeck.length, skillDiscardCount: game.skillDiscard.length,
    activeQuestion: question ? { id: question.id, kind: question.kind, text: question.text, options: question.kind === 'abc' ? question.options : undefined, hint: playedHint ? question.hint : undefined } : null,
    answerCards: question?.kind === 'fill' ? answerCards : [],
    removedOptionIds: question?.kind === 'abc' ? game.removedAnswers : [],
    firstWrongId: game.firstWrongId ? question?.kind === 'abc' ? game.firstWrongId : answerToken(match.id, game.firstWrongId) : null,
    submittedAnswerId: reveal && game.submittedAnswerId ? question?.kind === 'abc' ? game.submittedAnswerId : answerToken(match.id, game.submittedAnswerId) : null,
    answerCorrect: game.answerCorrect,
    correctAnswer: reveal && question ? question.kind === 'abc' ? question.correctOption : answerToken(match.id, question.answerId) : null,
    attackSkill: game.attackSkill ? { id: game.attackSkill.id, name: skillById[game.attackSkill.kind].name, cancelled: game.attackSkill.id === game.cancelledSkillId } : null,
    defenseSkill: game.defenseSkill ? { id: game.defenseSkill.id, name: skillById[game.defenseSkill.kind].name, cancelled: game.defenseSkill.id === game.cancelledSkillId } : null,
    winnerId: game.winnerId, victoryReason: game.victoryReason,
    correctCounts: game.correctCounts, defendedCounts: game.defendedCounts,
    elapsedActiveMs: game.elapsedActiveMs + (game.paused || game.phase === 'completed' ? 0 : Math.max(0, Date.now() - game.lastActiveAt)),
    events: game.phase === 'completed' ? game.events : game.events.slice(-18),
    private: ownTeam ? {
      hand: game.hands[ownTeam].map((card) => ({ id: card.id, kind: card.kind, name: skillById[card.kind].name, category: skillById[card.kind].category, description: skillById[card.kind].description, available: card.acquiredTurn < game.turn })),
      candidates: game.phase === 'question' && ownTeam === game.attackerId ? game.candidates.map((id) => { const q = set.questions.find((item) => item.id === id)!; return { id: q.id, kind: q.kind, text: q.text, options: q.kind === 'abc' ? q.options : undefined }; }) : [],
      reward: game.rewardCard && ownTeam === game.rewardOwnerId ? { name: skillById[game.rewardCard.kind].name } : null,
      canAct: !game.paused && (game.phase === 'question' && ownTeam === game.attackerId || game.phase === 'attack-skill' && ownTeam === game.attackerId || game.phase === 'defense-skill' && ownTeam === game.defenderId || game.phase === 'reaction' && !game.reactionsDone.includes(ownTeam) || ['answer', 'second-answer'].includes(game.phase) && ownTeam === game.defenderId || game.phase === 'sudden' && !game.reactionsDone.includes(ownTeam) || game.phase === 'reward' && ownTeam !== game.rewardOwnerId || game.phase === 'steal-cancel' && ownTeam === game.rewardOwnerId || game.phase === 'overflow' && ownTeam === game.rewardRecipientId)
    } : undefined
  };
}
