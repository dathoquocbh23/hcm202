import { randomUUID } from 'node:crypto';
import { SKILLS, skillById } from './skills.ts';
import type { AnswerRecord, GameCommand, GameEvent, GamePhase, GameState, QuestionSet, SkillCard, SkillId } from './types.ts';

const PHASE_MS = {
  question: 20_000,
  'attack-skill': 10_000,
  'defense-skill': 10_000,
  reaction: 5_000,
  // Long enough for everyone to read the locked answer and the correct one.
  reveal: 10_000,
  reward: 5_000,
  'steal-cancel': 5_000,
  overflow: 10_000,
  sudden: 15_000
} as const;

/** Skill and Vô Hiệu animations cover the answer screen; the defender gets this time back. */
const FX_GRACE_MS = 3_000;
/** A submitted answer may take this long to reach the server; clicks made before the deadline still count. */
export const ANSWER_LATENCY_MS = 3_000;
/** Fill-in questions show the correct card plus this many minus one wrong cards. */
const FILL_CHOICES = 6;

function shuffled<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function log(game: GameState, at: number, type: string, text: string, teamId?: string, detail?: Pick<GameEvent, 'skill' | 'damage' | 'outcome'>): void {
  const event: GameEvent = { id: randomUUID(), at, turn: game.turn, type, text, hp: { ...game.hp }, ...detail };
  if (teamId) event.teamId = teamId;
  game.events.push(event);
}

function fxGrace(game: GameState, at: number): number {
  const last = game.events.at(-1);
  return last && (last.type === 'skill' || last.type === 'nullify') ? Math.max(0, FX_GRACE_MS - (at - last.at)) : 0;
}

function record(game: GameState, entry: Omit<AnswerRecord, 'turn' | 'questionId' | 'skills'>): void {
  const skills = [game.attackSkill, game.defenseSkill].filter((card): card is SkillCard => Boolean(card))
    .map((card) => ({ kind: card.kind, cancelled: card.id === game.cancelledSkillId }));
  (game.answerLog ??= []).push({ turn: game.turn, questionId: game.activeQuestionId ?? '', skills: entry.sudden ? [] : skills, ...entry });
}

/** When the current phase really times out: answer phases wait out the network grace first. */
export function timeoutAt(game: GameState): number | null {
  if (game.phaseDeadline === null) return null;
  return game.phase === 'answer' || game.phase === 'second-answer' ? game.phaseDeadline + ANSWER_LATENCY_MS : game.phaseDeadline;
}

function setPhase(game: GameState, phase: GamePhase, at: number, durationMs?: number): void {
  game.phase = phase;
  game.phaseDeadline = durationMs === undefined ? null : at + durationMs;
}

function spendActiveTime(game: GameState, at: number): void {
  if (!game.paused && at > game.lastActiveAt) game.elapsedActiveMs += at - game.lastActiveAt;
  game.lastActiveAt = at;
}

function takeSkill(game: GameState, teamId: string, cardId: string, at: number): SkillCard {
  const hand = game.hands[teamId];
  const index = hand?.findIndex((card) => card.id === cardId) ?? -1;
  if (index < 0) throw new Error('Thẻ không có trên tay đội bạn.');
  const card = hand[index];
  if (card.acquiredTurn >= game.turn) throw new Error('Thẻ vừa rút chỉ được dùng từ lượt sau.');
  hand.splice(index, 1);
  log(game, at, 'skill', `Đội dùng kỹ năng ${skillById[card.kind].name}.`, teamId, { skill: card.kind });
  return card;
}

function activeKind(game: GameState, kind: SkillId): boolean {
  return [game.attackSkill, game.defenseSkill].some((card) => card?.kind === kind && card.id !== game.cancelledSkillId);
}

function ownOther(game: GameState, teamId: string): string {
  return game.teamIds.find((id) => id !== teamId) ?? '';
}

function answerKey(set: QuestionSet, questionId: string): string {
  const q = set.questions.find((item) => item.id === questionId);
  if (!q) throw new Error('Không tìm thấy câu hỏi.');
  return q.kind === 'fill' ? q.answerId : q.correctOption;
}

function currentQuestion(set: QuestionSet, game: GameState) {
  return set.questions.find((q) => q.id === game.activeQuestionId);
}

function startTurn(game: GameState, at: number): void {
  game.activeQuestionId = null;
  game.candidates = game.questionDeck.splice(0, Math.min(2, game.questionDeck.length));
  game.attackSkill = null;
  game.defenseSkill = null;
  game.cancelledSkillId = null;
  game.reactionsDone = [];
  game.answerRemainingMs = null;
  game.firstWrongId = null;
  game.submittedAnswerId = null;
  game.answerCorrect = null;
  game.rewardCard = null;
  game.rewardOwnerId = null;
  game.rewardRecipientId = null;
  game.activeDecoys = [];
  game.removedAnswers = [];
  if (!game.candidates.length) throw new Error('Bộ câu hỏi đã hết trước khi trận kết thúc.');
  setPhase(game, 'question', at, PHASE_MS.question);
  log(game, at, 'turn', `Bắt đầu lượt ${game.turn}.`, game.attackerId);
}

export function createGame(set: QuestionSet, teamIds: [string, string], at: number): GameState {
  const skillDeck: SkillCard[] = shuffled(SKILLS.flatMap((skill) =>
    Array.from({ length: skill.copies }, (_, index) => ({ id: `${skill.kind}-${index + 1}`, kind: skill.kind, acquiredTurn: -1 }))
  ));
  const [attackerId, defenderId] = shuffled(teamIds) as [string, string];
  const game: GameState = {
    phase: 'question', phaseDeadline: null, paused: false, pausedRemainingMs: null, answerRemainingMs: null,
    startedAt: at, lastActiveAt: at, elapsedActiveMs: 0,
    teamIds, attackerId, defenderId,
    hp: { [teamIds[0]]: 300, [teamIds[1]]: 300 },
    hands: { [teamIds[0]]: [], [teamIds[1]]: [] },
    questionDeck: shuffled(set.questions.map((q) => q.id)), questionDiscard: [],
    skillDeck, skillDiscard: [], answerBoard: shuffled(set.answers.map((a) => a.id)),
    activeDecoys: [], removedAnswers: [], candidates: [], activeQuestionId: null,
    attackSkill: null, defenseSkill: null, cancelledSkillId: null, reactionsDone: [],
    firstWrongId: null, submittedAnswerId: null, answerCorrect: null,
    rewardCard: null, rewardOwnerId: null, rewardRecipientId: null,
    turn: 1, attackCounts: { [teamIds[0]]: 0, [teamIds[1]]: 0 },
    correctCounts: { [teamIds[0]]: 0, [teamIds[1]]: 0 },
    defendedCounts: { [teamIds[0]]: 0, [teamIds[1]]: 0 },
    winnerId: null, victoryReason: null, suddenUsed: [], events: [], answerLog: []
  };
  log(game, at, 'start', 'Trận đấu bắt đầu.');
  startTurn(game, at);
  return game;
}

function dealBoard(game: GameState, set: QuestionSet): void {
  const question = currentQuestion(set, game);
  if (question?.kind !== 'fill') return;
  const wrong = shuffled(set.answers.map((a) => a.id).filter((id) => id !== question.answerId)).slice(0, FILL_CHOICES - 1);
  game.answerBoard = shuffled([question.answerId, ...wrong]);
}

function chooseQuestion(game: GameState, set: QuestionSet, questionId: string, at: number): void {
  if (!game.candidates.includes(questionId)) throw new Error('Câu hỏi không nằm trong hai thẻ vừa rút.');
  const other = game.candidates.find((id) => id !== questionId);
  if (other) game.questionDeck.push(other);
  game.candidates = [];
  game.activeQuestionId = questionId;
  game.questionDiscard.push(questionId);
  dealBoard(game, set);
  log(game, at, 'question', `Đánh câu hỏi ${questionId}.`, game.attackerId);
  setPhase(game, 'attack-skill', at, PHASE_MS['attack-skill']);
}

function beginReactionOrAnswer(game: GameState, set: QuestionSet, at: number): void {
  const eligible = game.teamIds.some((teamId) => game.hands[teamId].some((card) => card.kind === 'nullify' && card.acquiredTurn < game.turn));
  if ((game.attackSkill || game.defenseSkill) && eligible) setPhase(game, 'reaction', at, PHASE_MS.reaction);
  else beginAnswer(game, set, at);
}

function beginAnswer(game: GameState, set: QuestionSet, at: number): void {
  const question = currentQuestion(set, game);
  if (!question) throw new Error('Không tìm thấy câu hỏi của lượt này.');
  if (activeKind(game, 'confusion') && question.kind === 'fill') game.activeDecoys = shuffled(set.decoys.map((d) => d.id)).slice(0, 2);
  if (activeKind(game, 'narrow')) {
    const wrong = question.kind === 'fill'
      ? [...game.answerBoard, ...game.activeDecoys].filter((id) => id !== question.answerId)
      : (['A', 'B', 'C'] as const).filter((id) => id !== question.correctOption);
    game.removedAnswers = wrong.slice(0, question.kind === 'fill' ? 4 : 1);
  }
  const time = (activeKind(game, 'rush') ? 7 : 15) + (activeKind(game, 'extra-time') ? 10 : 0);
  setPhase(game, 'answer', at, time * 1000 + fxGrace(game, at));
  log(game, at, 'answer-open', `Bắt đầu trả lời: ${time} giây.`, game.defenderId);
}

function applyDefenseSkillDuringAnswer(game: GameState, set: QuestionSet): void {
  const question = currentQuestion(set, game);
  if (!question || !game.defenseSkill || game.defenseSkill.id === game.cancelledSkillId) return;
  if (game.defenseSkill.kind === 'narrow') {
    const wrong = question.kind === 'fill'
      ? [...game.answerBoard, ...game.activeDecoys].filter((id) => id !== question.answerId)
      : (['A', 'B', 'C'] as const).filter((id) => id !== question.correctOption);
    game.removedAnswers = wrong.slice(0, question.kind === 'fill' ? 4 : 1);
  }
  if (game.defenseSkill.kind === 'extra-time' && game.phaseDeadline !== null) game.phaseDeadline += 10_000;
}

function resumeAnswerAfterReaction(game: GameState, set: QuestionSet, at: number): void {
  const remaining = game.answerRemainingMs ?? 0;
  game.answerRemainingMs = null;
  setPhase(game, 'answer', at, remaining + fxGrace(game, at));
  applyDefenseSkillDuringAnswer(game, set);
}

function finishAnswer(game: GameState, set: QuestionSet, at: number, submitted: string | null, correct: boolean, second = false): void {
  game.submittedAnswerId = submitted;
  game.answerCorrect = correct;
  game.defendedCounts[game.defenderId]++;
  const damage = correct
    ? (second ? 30 : 0) + (activeKind(game, 'pierce') ? 30 : 0)
    : activeKind(game, 'double-strike') ? 120 : 60;
  game.hp[game.defenderId] = Math.max(0, game.hp[game.defenderId] - damage);
  if (correct) game.correctCounts[game.defenderId]++;
  game.rewardOwnerId = correct ? game.defenderId : game.attackerId;
  const q = currentQuestion(set, game);
  const key = answerKey(set, game.activeQuestionId ?? '');
  const answerLabel = q?.kind === 'fill' ? set.answers.find((a) => a.id === key)?.text : q?.kind === 'abc' ? `${key}. ${q.options[key as 'A' | 'B' | 'C']}` : key;
  record(game, { teamId: game.defenderId, submitted, outcome: correct ? 'correct' : submitted ? 'wrong' : 'timeout', damage });
  log(game, at, 'answer-result', `${correct ? 'Trả lời đúng' : submitted ? 'Trả lời sai' : 'Hết giờ'} · ${damage} sát thương · Đáp án: ${answerLabel}.`, game.defenderId, { damage, outcome: correct ? 'correct' : submitted ? 'wrong' : 'timeout' });
  if (game.hp[game.defenderId] === 0) {
    game.winnerId = game.attackerId;
    game.victoryReason = 'knockout';
    setPhase(game, 'completed', at);
    log(game, at, 'completed', 'Hạ gục. Trận đấu kết thúc.', game.attackerId);
    return;
  }
  setPhase(game, 'reveal', at, PHASE_MS.reveal);
}

function answer(game: GameState, set: QuestionSet, answerId: string, at: number): void {
  const question = currentQuestion(set, game);
  if (!question) throw new Error('Câu hỏi không hợp lệ.');
  const available = question.kind === 'fill'
    ? [...game.answerBoard, ...game.activeDecoys].filter((id) => !game.removedAnswers.includes(id))
    : (['A', 'B', 'C'] as const).filter((id) => !game.removedAnswers.includes(id));
  if (!available.includes(answerId)) throw new Error('Thẻ đáp án không có trên bàn.');
  if (game.firstWrongId === answerId) throw new Error('Không thể chọn lại đáp án sai lần trước.');
  const correct = answerId === answerKey(set, game.activeQuestionId ?? '');
  if (!correct && game.phase === 'answer' && activeKind(game, 'second-chance') && (game.phaseDeadline ?? 0) > at) {
    game.firstWrongId = answerId;
    game.phase = 'second-answer';
    log(game, at, 'first-wrong', 'Lần trả lời đầu chưa đúng. Đội được chọn lại trong thời gian còn lại.', game.defenderId);
    return;
  }
  finishAnswer(game, set, at, answerId, correct, game.phase === 'second-answer');
}

function startReward(game: GameState, set: QuestionSet, at: number): void {
  const card = game.skillDeck.shift() ?? null;
  if (!card) {
    log(game, at, 'empty-skill-deck', 'Chồng kỹ năng đã hết.');
    endTurn(game, set, at);
    return;
  }
  game.rewardCard = { ...card, acquiredTurn: game.turn };
  game.rewardRecipientId = game.rewardOwnerId;
  log(game, at, 'reward', 'Một thẻ kỹ năng được rút.', game.rewardOwnerId ?? undefined);
  const thiefId = game.rewardOwnerId ? ownOther(game, game.rewardOwnerId) : '';
  if (thiefId && game.hands[thiefId].some((item) => item.kind === 'steal' && item.acquiredTurn < game.turn)) setPhase(game, 'reward', at, PHASE_MS.reward);
  else settleReward(game, set, at);
}

function settleReward(game: GameState, set: QuestionSet, at: number): void {
  const recipient = game.rewardRecipientId;
  if (recipient && game.rewardCard) game.hands[recipient].push(game.rewardCard);
  game.rewardCard = null;
  if (recipient && game.hands[recipient].length > 2) setPhase(game, 'overflow', at, PHASE_MS.overflow);
  else endTurn(game, set, at);
}

function beginSudden(game: GameState, set: QuestionSet, at: number): void {
  const available = game.questionDeck.filter((id) => !game.suddenUsed.includes(id));
  const source = available.length ? available : game.questionDiscard.filter((id) => !game.suddenUsed.includes(id));
  if (!source.length) game.suddenUsed = [];
  const fallback = game.questionDiscard[game.suddenUsed.length % Math.max(1, game.questionDiscard.length)];
  game.activeQuestionId = source[0] ?? fallback;
  if (!game.activeQuestionId) throw new Error('Không còn câu hỏi cho lượt đột tử.');
  game.suddenUsed.push(game.activeQuestionId);
  dealBoard(game, set);
  game.firstWrongId = null;
  game.reactionsDone = [];
  setPhase(game, 'sudden', at, PHASE_MS.sudden);
  log(game, at, 'sudden', `Đột tử: câu ${game.activeQuestionId}.`);
}

function completeLimit(game: GameState, set: QuestionSet, at: number): void {
  const [a, b] = game.teamIds;
  if (game.hp[a] === game.hp[b]) {
    beginSudden(game, set, at);
    return;
  }
  game.winnerId = game.hp[a] > game.hp[b] ? a : b;
  game.victoryReason = 'limit';
  setPhase(game, 'completed', at);
  log(game, at, 'completed', 'Hết giới hạn lượt hoặc thời gian. Trận đấu kết thúc.', game.winnerId);
}

function endTurn(game: GameState, set: QuestionSet, at: number): void {
  for (const skill of [game.attackSkill, game.defenseSkill]) {
    if (skill && skill.id !== game.cancelledSkillId) game.skillDiscard.push(skill);
  }
  game.attackCounts[game.attackerId]++;
  if (game.turn >= 20 || game.elapsedActiveMs >= 20 * 60_000) {
    completeLimit(game, set, at);
    return;
  }
  [game.attackerId, game.defenderId] = [game.defenderId, game.attackerId];
  game.turn++;
  startTurn(game, at);
}

function suddenAnswer(game: GameState, set: QuestionSet, teamId: string, answerId: string, at: number): void {
  const q = currentQuestion(set, game);
  if (!q) throw new Error('Câu hỏi đột tử không hợp lệ.');
  const available = q.kind === 'fill' ? game.answerBoard : ['A', 'B', 'C'];
  if (!available.includes(answerId)) throw new Error('Đáp án không hợp lệ.');
  if (game.reactionsDone.includes(teamId)) throw new Error('Đội đã trả lời câu hỏi đột tử này.');
  const correct = answerId === answerKey(set, q.id);
  record(game, { teamId, submitted: answerId, outcome: correct ? 'correct' : 'wrong', damage: 0, sudden: true });
  if (correct) {
    game.winnerId = teamId;
    game.victoryReason = 'sudden';
    setPhase(game, 'completed', at);
    log(game, at, 'completed', 'Đội trả lời đúng nhanh nhất trong lượt đột tử.', teamId);
  } else {
    game.reactionsDone.push(teamId);
    log(game, at, 'sudden-wrong', 'Một đội đã trả lời chưa đúng trong lượt đột tử.', teamId);
    if (game.reactionsDone.length === 2) beginSudden(game, set, at);
  }
}

export function advanceGame(source: GameState, set: QuestionSet, now: number): GameState {
  const game: GameState = structuredClone(source);
  if (game.paused || game.phase === 'completed') return game;
  let cycles = 0;
  while ((timeoutAt(game) ?? Infinity) <= now && cycles++ < 100) {
    const at = timeoutAt(game)!;
    spendActiveTime(game, at);
    switch (game.phase) {
      case 'question': chooseQuestion(game, set, game.candidates[0], at); break;
      case 'attack-skill': beginReactionOrAnswer(game, set, at); break;
      case 'defense-skill': beginReactionOrAnswer(game, set, at); break;
      case 'reaction': game.answerRemainingMs != null ? resumeAnswerAfterReaction(game, set, at) : beginAnswer(game, set, at); break;
      case 'answer': case 'second-answer': finishAnswer(game, set, at, null, false); break;
      case 'reveal': startReward(game, set, at); break;
      case 'reward': case 'steal-cancel': settleReward(game, set, at); break;
      case 'overflow': {
        const teamId = game.rewardRecipientId;
        if (teamId && game.hands[teamId].length > 2) {
          const oldest = game.hands[teamId].shift();
          if (oldest) game.skillDiscard.push(oldest);
          log(game, at, 'overflow', 'Hết thời gian chọn thẻ bỏ: thẻ cũ nhất được bỏ.', teamId);
        }
        endTurn(game, set, at);
        break;
      }
      case 'sudden': beginSudden(game, set, at); break;
    }
  }
  if (game.phaseDeadline !== null) spendActiveTime(game, now);
  return game;
}

export function actGame(source: GameState, set: QuestionSet, actorId: string | 'admin', command: GameCommand, now: number): GameState {
  const game = advanceGame(source, set, now);
  if (command.type === 'pause' || command.type === 'resume') {
    if (actorId !== 'admin') throw new Error('Chỉ Admin được tạm dừng hoặc tiếp tục trận.');
    if (game.phase === 'completed') throw new Error('Trận đã kết thúc.');
    if (command.type === 'pause') {
      if (game.paused) throw new Error('Trận đã tạm dừng.');
      game.paused = true;
      game.pausedRemainingMs = game.phaseDeadline === null ? null : Math.max(0, game.phaseDeadline - now);
      log(game, now, 'pause', 'Admin tạm dừng trận.');
    } else {
      if (!game.paused) throw new Error('Trận chưa tạm dừng.');
      game.paused = false;
      game.lastActiveAt = now;
      game.phaseDeadline = game.pausedRemainingMs === null ? null : now + game.pausedRemainingMs;
      game.pausedRemainingMs = null;
      log(game, now, 'resume', 'Admin tiếp tục trận.');
    }
    return game;
  }
  if (actorId === 'admin') throw new Error('Admin chỉ theo dõi, không chọn bài hoặc đáp án của đội.');
  if (game.paused || game.phase === 'completed') throw new Error('Trận đang tạm dừng hoặc đã kết thúc.');
  if (!game.teamIds.includes(actorId)) throw new Error('Đội không thuộc trận này.');
  const attack = actorId === game.attackerId;
  const defense = actorId === game.defenderId;
  switch (command.type) {
    case 'choose-question':
      if (game.phase !== 'question' || !attack) throw new Error('Chưa tới lượt đội chọn câu hỏi.');
      chooseQuestion(game, set, command.questionId, now);
      break;
    case 'play-skill': {
      const category = game.phase === 'attack-skill' && attack ? 'attack' : (game.phase === 'answer' || game.phase === 'defense-skill') && defense ? 'defense' : null;
      if (!category) throw new Error('Chưa tới lượt dùng kỹ năng của đội.');
      if (category === 'defense' && game.defenseSkill) throw new Error('Đội đã dùng kỹ năng thủ trong lượt này.');
      const item = game.hands[actorId].find((card) => card.id === command.cardId);
      if (!item || skillById[item.kind].category !== category) throw new Error('Kỹ năng không hợp lệ cho pha này.');
      const q = currentQuestion(set, game);
      if (item.kind === 'confusion' && q?.kind === 'abc') throw new Error('Nhiễu Loạn không dùng cho câu ABC.');
      const played = takeSkill(game, actorId, command.cardId, now);
      if (category === 'attack') {
        game.attackSkill = played;
        beginReactionOrAnswer(game, set, now);
      } else {
        game.defenseSkill = played;
        if (game.phase === 'defense-skill') beginReactionOrAnswer(game, set, now);
        else if (game.hands[game.attackerId].some((card) => card.kind === 'nullify' && card.acquiredTurn < game.turn)) {
          game.answerRemainingMs = Math.max(0, (game.phaseDeadline ?? now) - now);
          game.reactionsDone = [game.defenderId];
          setPhase(game, 'reaction', now, PHASE_MS.reaction);
        } else {
          applyDefenseSkillDuringAnswer(game, set);
          if (game.phaseDeadline !== null) game.phaseDeadline += fxGrace(game, now);
        }
      }
      break;
    }
    case 'pass':
      if (game.phase === 'attack-skill' && attack) beginReactionOrAnswer(game, set, now);
      else if (game.phase === 'defense-skill' && defense) beginReactionOrAnswer(game, set, now);
      else if (game.phase === 'reaction') {
        if (game.reactionsDone.includes(actorId)) throw new Error('Đội đã quyết định pha phản đòn.');
        game.reactionsDone.push(actorId);
        if (game.reactionsDone.length === 2) {
          if (game.answerRemainingMs != null) resumeAnswerAfterReaction(game, set, now);
          else beginAnswer(game, set, now);
        }
      } else if (game.phase === 'reward' && actorId !== game.rewardOwnerId) settleReward(game, set, now);
      else if (game.phase === 'steal-cancel' && actorId === game.rewardOwnerId) settleReward(game, set, now);
      else throw new Error('Không thể bỏ qua trong pha này.');
      break;
    case 'nullify': {
      if (game.phase === 'reaction') {
        if (game.reactionsDone.includes(actorId)) throw new Error('Đội đã quyết định pha phản đòn.');
        const target = [game.attackSkill, game.defenseSkill].find((card) => card?.id === command.targetCardId);
        if (!target || game.cancelledSkillId || (attack && target !== game.defenseSkill) || (defense && target !== game.attackSkill)) throw new Error('Không có kỹ năng đối thủ phù hợp để hủy.');
        game.skillDiscard.push(takeReaction(game, actorId, 'nullify', now));
        game.cancelledSkillId = target.id;
        game.skillDiscard.push(target);
        log(game, now, 'nullify', 'Một kỹ năng đối thủ đã bị Vô Hiệu.', actorId);
        if (game.answerRemainingMs != null) resumeAnswerAfterReaction(game, set, now);
        else beginAnswer(game, set, now);
      } else if (game.phase === 'steal-cancel' && actorId === game.rewardOwnerId && command.targetCardId === 'steal') {
        game.skillDiscard.push(takeReaction(game, actorId, 'nullify', now));
        game.rewardRecipientId = game.rewardOwnerId;
        log(game, now, 'nullify-steal', 'Đánh Cắp đã bị Vô Hiệu.', actorId);
        settleReward(game, set, now);
      } else throw new Error('Không thể dùng Vô Hiệu lúc này.');
      break;
    }
    case 'answer':
      if (game.phase === 'sudden') suddenAnswer(game, set, actorId, command.answerId, now);
      else {
        if (!defense || !['answer', 'second-answer'].includes(game.phase)) throw new Error('Chưa tới lượt đội trả lời.');
        // Trust the click time only within the latency grace, never beyond the server's clock.
        const clickedAt = Math.min(now, Math.max(Number.isFinite(command.at) ? command.at! : now, now - ANSWER_LATENCY_MS));
        if (clickedAt > (game.phaseDeadline ?? now)) throw new Error('Đã hết giờ trả lời.');
        answer(game, set, command.answerId, now);
      }
      break;
    case 'steal':
      if (game.phase !== 'reward' || actorId === game.rewardOwnerId) throw new Error('Chưa tới lượt Đánh Cắp.');
      game.skillDiscard.push(takeReaction(game, actorId, 'steal', now));
      game.rewardRecipientId = actorId;
      log(game, now, 'steal', 'Đánh Cắp thẻ kỹ năng vừa rút.', actorId);
      if (game.rewardOwnerId && game.hands[game.rewardOwnerId].some((card) => card.kind === 'nullify' && card.acquiredTurn < game.turn)) setPhase(game, 'steal-cancel', now, PHASE_MS['steal-cancel']);
      else settleReward(game, set, now);
      break;
    case 'discard': {
      if (game.phase !== 'overflow' || actorId !== game.rewardRecipientId) throw new Error('Đội không cần bỏ thẻ lúc này.');
      const discarded = game.hands[actorId].find((card) => card.id === command.cardId);
      if (!discarded) throw new Error('Không tìm thấy thẻ cần bỏ.');
      game.hands[actorId] = game.hands[actorId].filter((card) => card.id !== command.cardId);
      game.skillDiscard.push(discarded);
      log(game, now, 'overflow', 'Đội đã bỏ một thẻ để giữ tối đa hai thẻ.', actorId);
      endTurn(game, set, now);
      break;
    }
  }
  return game;
}

function takeReaction(game: GameState, actorId: string, kind: 'nullify' | 'steal', at: number): SkillCard {
  const card = game.hands[actorId].find((item) => item.kind === kind && item.acquiredTurn < game.turn);
  if (!card) throw new Error(`Đội không có thẻ ${skillById[kind].name} hợp lệ.`);
  return takeSkill(game, actorId, card.id, at);
}
