import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { insertStoredRoom, listStoredRooms, readStoredRoom, updateStoredRoom } from './room-repository.ts';
import { advanceGame, actGame, createGame } from '../../features/game/engine.ts';
import sampleJson from '../../features/game/data/sample-set.json' with { type: 'json' };
import { skillById } from '../../features/game/skills.ts';
import { validateQuestionSet } from '../../features/game/validate-set.ts';
import type { AnswerRecord, GameCommand, GameState, Match, QuestionSet, Room, Team, Viewer } from '../../features/game/types.ts';

const sampleSet = sampleJson as unknown as QuestionSet;
const palette: Team['color'][] = ['red', 'yellow', 'green', 'blue'];
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

export async function getRoom(code: string): Promise<Room | null> {
  const room = await readStoredRoom(code);
  if (!room || !needsTick(room)) return room;
  return tickRoom(room.code);
}

export async function listRooms(): Promise<Room[]> {
  const rooms = await listStoredRooms();
  const result: Room[] = [];
  for (const room of rooms) result.push(needsTick(room) ? await tickRoom(room.code) : room);
  return result;
}

export async function createRoom(title: string, practiceReuse: boolean): Promise<Room> {
  if (!adminConfigured()) throw new Error('Hãy cấu hình ADMIN_PASSWORD trước khi tạo giải đấu.');
  const clean = title.trim();
  if (clean.length < 3 || clean.length > 80) throw new Error('Tên giải đấu cần từ 3 đến 80 ký tự.');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = Array.from(randomBytes(6), (byte) => alphabet[byte % alphabet.length]).join('');
    const room: Room = {
      code, title: clean, createdAt: Date.now(), joinLocked: false, practiceReuse,
      teams: [], matches: [], sets: [sampleSet], events: [], revision: 1,
      displayTokenHash: hash(displayToken(code)), processedCommands: []
    };
    if (await insertStoredRoom(room)) return room;
  }
  throw new Error('Không tạo được mã phòng. Vui lòng thử lại.');
}

export function roomTeamFromToken(room: Room, token: string | undefined): Team | null {
  if (!token) return null;
  const tokenHash = hash(token);
  return room.teams.find((team) => equal(team.tokenHash, tokenHash)) ?? null;
}

export async function joinRoom(code: string, name: string): Promise<{ room: Room; team: Team; token: string }> {
  const cleanName = name.trim().replace(/\s+/g, ' ');
  if (cleanName.length < 2 || cleanName.length > 36) throw new Error('Tên đội cần từ 2 đến 36 ký tự.');
  const token = randomBytes(32).toString('hex');
  const team = await mutateRoom(code, (room) => {
    if (room.joinLocked) throw new Error('Phòng đã khóa nhận đội mới.');
    if (room.teams.some((item) => item.name.normalize('NFC').toLocaleLowerCase('vi') === cleanName.normalize('NFC').toLocaleLowerCase('vi') && item.status !== 'rejected')) throw new Error('Tên đội đã được sử dụng.');
    if (room.teams.filter((item) => item.status === 'approved').length >= 4) throw new Error('Phòng đã đủ bốn đội.');
    const item: Team = { id: randomUUID(), name: cleanName, color: palette[room.teams.filter((t) => t.status === 'approved').length % 4], status: 'pending', ready: false, tokenHash: hash(token), lastSeen: Date.now(), joinedAt: Date.now() };
    room.teams.push(item);
    room.events.push({ id: randomUUID(), at: Date.now(), turn: 0, type: 'join', text: `${cleanName} gửi yêu cầu tham gia.`, teamId: item.id });
    return item;
  });
  const room = (await getRoom(code))!;
  return { room, team, token };
}

async function mutateRoom<T>(code: string, action: (room: Room) => T, commandId?: string, expectedRevision?: number): Promise<T> {
  const result = await updateStoredRoom(code, (room) => {
    if (commandId && room.processedCommands.includes(commandId)) return { value: undefined as T, changed: false };
    if (expectedRevision !== undefined && room.revision !== expectedRevision) throw new Error('Dữ liệu trận đã thay đổi. Vui lòng đồng bộ và thử lại.');
    const value = action(room);
    room.revision++;
    if (commandId) room.processedCommands = [...room.processedCommands, commandId].slice(-300);
    return { value, changed: true };
  });
  return result.value;
}

function finishMatchInRoom(room: Room, match: Match, at: number): void {
  if (match.status !== 'active' || match.game?.phase !== 'completed') return;
  match.status = 'completed';
  room.events.push({ id: randomUUID(), at, turn: match.game.turn, type: 'match-completed', text: `${labelRound(match.round)} hoàn tất.`, teamId: match.game.winnerId ?? undefined });
  const first = room.matches.find((item) => item.round === 'semifinal-a');
  const second = room.matches.find((item) => item.round === 'semifinal-b');
  const final = room.matches.find((item) => item.round === 'final');
  if (first?.status === 'completed' && second?.status === 'completed' && final && !final.teamIds) {
    // Finalists confirm again once the admin sends the invitation.
    final.teamIds = [first.game!.winnerId!, second.game!.winnerId!];
    for (const id of final.teamIds) {
      const team = room.teams.find((item) => item.id === id);
      if (team) team.ready = false;
    }
    room.events.push({ id: randomUUID(), at, turn: 0, type: 'finalists', text: 'Hai đội vào chung kết đã được xác định.' });
  }
}

function needsTick(room: Room, at = Date.now()): boolean {
  return room.matches.some((match) => match.status === 'active' && match.game && !match.game.paused && match.game.phaseDeadline !== null && match.game.phaseDeadline <= at);
}

async function tickRoom(code: string): Promise<Room> {
  const result = await updateStoredRoom(code, (room) => {
    const at = Date.now();
    if (!needsTick(room, at)) return { value: undefined, changed: false };
    for (const match of room.matches) {
      if (match.status === 'active' && match.game && !match.game.paused && match.game.phaseDeadline !== null && match.game.phaseDeadline <= at) {
        // advanceGame catches up using stored deadlines, even after an idle function.
        match.game = advanceGame(match.game, questionSetFor(room, match), at);
        finishMatchInRoom(room, match, at);
      }
    }
    room.revision++;
    return { value: undefined, changed: true };
  });
  return result.room;
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
  | { type: 'invite-final'; matchId: string }
  | { type: 'lock-joins'; locked: boolean }
  | { type: 'import-set'; value: unknown }
  | { type: 'assign-set'; matchId: string; setId: string }
  | { type: 'game'; matchId: string; action: GameCommand; expected?: { turn: number; phase: GameState['phase'] } };

export async function commandRoom(code: string, viewer: Viewer, command: RoomCommand, commandId: string, expectedRevision: number): Promise<Room> {
  if (!/^[\w-]{8,100}$/.test(commandId)) throw new Error('Thiếu mã thao tác hợp lệ.');
  const current = await getRoom(code);
  if (!current) throw new Error('Không tìm thấy phòng thi.');
  if (current.processedCommands.includes(commandId)) return current;
  // Game actions are checked against their own match (turn + phase) so two concurrent
  // matches, and the timer ticks they cause, do not invalidate each other's clicks.
  // "ready" carries the desired state, so it is safe to apply on any revision.
  const roomScoped = command.type !== 'game' && command.type !== 'ready';
  await mutateRoom(code, (room) => {
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
        if (match.round === 'final' && !match.invitedAt) throw new Error('Hãy mời hai đội vào chung kết trước.');
        match.game = createGame(questionSetFor(room, match), match.teamIds, at);
        match.status = 'active';
        room.events.push({ id: randomUUID(), at, turn: 0, type: 'start-match', text: `${labelRound(match.round)} bắt đầu.` });
        break;
      }
      case 'invite-final': {
        requireAdmin(viewer);
        const match = room.matches.find((item) => item.id === command.matchId && item.round === 'final');
        if (!match?.teamIds || match.status !== 'pending') throw new Error('Chung kết chưa có đủ hai đội.');
        match.invitedAt = at;
        room.events.push({ id: randomUUID(), at, turn: 0, type: 'invite-final', text: `Admin mời ${match.teamIds.map((id) => room.teams.find((team) => team.id === id)?.name ?? 'Đội').join(' và ')} vào chung kết.` });
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
  return (await getRoom(code))!;
}

export async function touchTeam(room: Room, teamId: string): Promise<Room> {
  const team = room.teams.find((item) => item.id === teamId);
  if (!team || Date.now() - team.lastSeen < 5000) return room;
  const result = await updateStoredRoom(room.code, (fresh) => {
    const actual = fresh.teams.find((item) => item.id === teamId);
    if (!actual || Date.now() - actual.lastSeen < 5000) return { value: undefined, changed: false };
    actual.lastSeen = Date.now();
    return { value: undefined, changed: true };
  });
  return result.room;
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

/** Matches stored before answerLog existed: rebuild what the event log still tells us. */
function answersFromEvents(game: GameState): AnswerRecord[] {
  let questionId = '';
  const records: AnswerRecord[] = [];
  for (const event of game.events) {
    const asked = event.type === 'question' ? /câu hỏi (\S+)\./.exec(event.text) : event.type === 'sudden' ? /câu (\S+)\./.exec(event.text) : null;
    if (asked) questionId = asked[1];
    if (event.type === 'answer-result' && event.teamId) {
      const outcome = event.outcome ?? (event.text.startsWith('Trả lời đúng') ? 'correct' : event.text.startsWith('Hết giờ') ? 'timeout' : 'wrong');
      records.push({ turn: event.turn, questionId, teamId: event.teamId, submitted: null, outcome, damage: event.damage ?? Number(/(\d+) sát thương/.exec(event.text)?.[1] ?? 0), skills: [] });
    }
  }
  return records;
}

/** Full question-by-question review; only sent once the match is over, since it holds the answers. */
function reviewAnswers(set: QuestionSet, game: GameState) {
  const label = (question: QuestionSet['questions'][number], id: string | null) => !id ? null
    : question.kind === 'abc' ? `${id}. ${question.options[id as 'A' | 'B' | 'C'] ?? ''}`
    : set.answers.find((card) => card.id === id)?.text ?? set.decoys.find((card) => card.id === id)?.text ?? id;
  return (game.answerLog ?? answersFromEvents(game)).flatMap((entry) => {
    const question = set.questions.find((item) => item.id === entry.questionId);
    if (!question) return [];
    return [{
      turn: entry.turn, teamId: entry.teamId, questionId: question.id, kind: question.kind, text: question.text,
      options: question.kind === 'abc' ? question.options : undefined,
      submitted: label(question, entry.submitted), correctAnswer: label(question, question.kind === 'abc' ? question.correctOption : question.answerId),
      outcome: entry.outcome, damage: entry.damage, sudden: entry.sudden ?? false, known: Boolean(game.answerLog),
      skills: entry.skills.map((skill) => ({ name: skillById[skill.kind].name, cancelled: skill.cancelled }))
    }];
  });
}

export function projectRoom(room: Room, viewer: Viewer) {
  const at = Date.now();
  return {
    code: room.code, title: room.title, joinLocked: room.joinLocked, practiceReuse: room.practiceReuse, revision: room.revision,
    viewer, serverTime: at,
    displayToken: viewer.role === 'admin' ? adminDisplayToken(room) : undefined,
    teams: room.teams.filter((team) => viewer.role === 'admin' || team.status === 'approved' || viewer.role === 'team' && team.id === viewer.teamId).map((team) => ({ id: team.id, name: team.name, color: team.color, status: team.status, ready: team.ready, online: at - team.lastSeen < 30_000, lastSeen: team.lastSeen })),
    matches: room.matches.map((match) => ({ id: match.id, round: match.round, teamIds: match.teamIds, setId: viewer.role === 'admin' ? match.setId : undefined, status: match.status, invitedAt: match.invitedAt ?? null, game: match.game ? projectGame(room, match, viewer) : null })),
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
    review: game.phase === 'completed' ? reviewAnswers(set, game) : undefined,
    // Sudden-death misses stay hidden until the end so the other team gains nothing from them.
    lastAnswer: reviewAnswers(set, game).filter((entry) => !entry.sudden || game.phase === 'completed').at(-1) ?? null,
    private: ownTeam ? {
      hand: game.hands[ownTeam].map((card) => ({ id: card.id, kind: card.kind, name: skillById[card.kind].name, category: skillById[card.kind].category, description: skillById[card.kind].description, available: card.acquiredTurn < game.turn })),
      candidates: game.phase === 'question' && ownTeam === game.attackerId ? game.candidates.map((id) => { const q = set.questions.find((item) => item.id === id)!; return { id: q.id, kind: q.kind, text: q.text, options: q.kind === 'abc' ? q.options : undefined }; }) : [],
      reward: game.rewardCard && ownTeam === game.rewardOwnerId ? { name: skillById[game.rewardCard.kind].name } : null,
      canAct: !game.paused && (game.phase === 'question' && ownTeam === game.attackerId || game.phase === 'attack-skill' && ownTeam === game.attackerId || game.phase === 'defense-skill' && ownTeam === game.defenderId || game.phase === 'reaction' && !game.reactionsDone.includes(ownTeam) || ['answer', 'second-answer'].includes(game.phase) && ownTeam === game.defenderId || game.phase === 'sudden' && !game.reactionsDone.includes(ownTeam) || game.phase === 'reward' && ownTeam !== game.rewardOwnerId || game.phase === 'steal-cancel' && ownTeam === game.rewardOwnerId || game.phase === 'overflow' && ownTeam === game.rewardRecipientId)
    } : undefined
  };
}
