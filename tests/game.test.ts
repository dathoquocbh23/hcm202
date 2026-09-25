import assert from 'node:assert/strict';
import test from 'node:test';
import sampleJson from '../src/features/game/data/sample-set.json' with { type: 'json' };
import set2Json from '../src/features/game/data/set-2-ban-ket-b.json' with { type: 'json' };
import set3Json from '../src/features/game/data/set-3-chung-ket.json' with { type: 'json' };
import { ANSWER_LATENCY_MS, actGame, advanceGame, createGame } from '../src/features/game/engine.ts';
import { validateQuestionSet } from '../src/features/game/validate-set.ts';
import type { GameState, Question, QuestionSet } from '../src/features/game/types.ts';

const set = sampleJson as QuestionSet;
const startAt = 1_700_000_000_000;

function selected(game: GameState): Question {
  const question = set.questions.find((item) => item.id === game.candidates[0]);
  assert.ok(question);
  return question;
}

function answerOf(question: Question): string { return question.kind === 'fill' ? question.answerId : question.correctOption; }
function wrongOf(question: Question, game: GameState): string {
  if (question.kind === 'abc') return (['A', 'B', 'C'] as const).find((id) => id !== question.correctOption)!;
  return game.answerBoard.find((id) => id !== question.answerId)!;
}
function openAnswer(game: GameState, question: Question, at: number): GameState {
  const chosen = actGame(game, set, game.attackerId, { type: 'choose-question', questionId: question.id }, at + 100);
  return actGame(chosen, set, chosen.attackerId, { type: 'pass' }, at + 200);
}

test('all three built-in question sets satisfy the full match format', () => {
  for (const builtIn of [set, set2Json, set3Json] as QuestionSet[]) assert.deepEqual(validateQuestionSet(builtIn).errors, [], builtIn.id);
});

test('a correct answer keeps HP, grants the defender a reward, and changes turns', () => {
  const initial = createGame(set, ['alpha', 'beta'], startAt);
  const question = selected(initial);
  const defender = initial.defenderId;
  const attacker = initial.attackerId;
  const answering = openAnswer(initial, question, startAt);
  assert.equal(answering.phase, 'answer');
  const revealed = actGame(answering, set, defender, { type: 'answer', answerId: answerOf(question) }, startAt + 500);
  assert.equal(revealed.answerCorrect, true);
  assert.equal(revealed.hp[defender], 300);
  assert.equal(revealed.rewardOwnerId, defender);
  const next = advanceGame(revealed, set, startAt + 10_600);
  assert.equal(next.phase, 'question');
  assert.equal(next.turn, 2);
  assert.equal(next.attackerId, defender);
  assert.equal(next.defenderId, attacker);
  assert.equal(next.hands[defender].length, 1);
});

test('a wrong answer causes 60 damage and timeout follows the same rule', () => {
  for (const timeout of [false, true]) {
    const initial = createGame(set, ['alpha', 'beta'], startAt);
    const question = selected(initial);
    const answering = openAnswer(initial, question, startAt);
    const result = timeout
      ? advanceGame(answering, set, answering.phaseDeadline! + ANSWER_LATENCY_MS + 1)
      : actGame(answering, set, answering.defenderId, { type: 'answer', answerId: wrongOf(question, answering) }, startAt + 500);
    assert.equal(result.answerCorrect, false);
    assert.equal(result.hp[answering.defenderId], 240);
    assert.equal(result.rewardOwnerId, answering.attackerId);
  }
});

test('Second Chance preserves the original deadline and a corrected answer costs 30 HP', () => {
  let game = createGame(set, ['alpha', 'beta'], startAt);
  const question = selected(game);
  const defender = game.defenderId;
  game.hands[defender].push({ id: 'second-chance-test', kind: 'second-chance', acquiredTurn: 0 });
  game = openAnswer(game, question, startAt);
  game = actGame(game, set, defender, { type: 'play-skill', cardId: 'second-chance-test' }, startAt + 300);
  const originalDeadline = game.phaseDeadline;
  game = actGame(game, set, defender, { type: 'answer', answerId: wrongOf(question, game) }, startAt + 400);
  assert.equal(game.phase, 'second-answer');
  assert.equal(game.phaseDeadline, originalDeadline);
  game = actGame(game, set, defender, { type: 'answer', answerId: answerOf(question) }, startAt + 500);
  assert.equal(game.answerCorrect, true);
  assert.equal(game.hp[defender], 270);
});

test('the defender can use Hint or Narrow while reading the answer and gets the card animation time back', () => {
  for (const kind of ['hint', 'narrow'] as const) {
    const initial = createGame(set, ['alpha', 'beta'], startAt);
    const question = selected(initial);
    initial.hands[initial.defenderId].push({ id: `defense-${kind}`, kind, acquiredTurn: 0 });
    const answering = openAnswer(initial, question, startAt);
    const originalDeadline = answering.phaseDeadline;
    const played = actGame(answering, set, answering.defenderId, { type: 'play-skill', cardId: `defense-${kind}` }, startAt + 300);
    assert.equal(played.phase, 'answer');
    assert.equal(played.phaseDeadline, originalDeadline! + 3_000);
    assert.equal(played.defenseSkill?.kind, kind);
    if (kind === 'narrow') {
      assert.equal(played.removedAnswers.length, question.kind === 'abc' ? 1 : 4);
      assert.ok(!played.removedAnswers.includes(answerOf(question)));
    }
    assert.throws(() => actGame(played, set, played.defenderId, { type: 'play-skill', cardId: `defense-${kind}` }, startAt + 350), /đã dùng kỹ năng thủ/);
  }
});

test('Extra Time adds ten seconds when used during the answer', () => {
  const initial = createGame(set, ['alpha', 'beta'], startAt);
  const question = selected(initial);
  initial.hands[initial.defenderId].push({ id: 'extra-time-test', kind: 'extra-time', acquiredTurn: 0 });
  const answering = openAnswer(initial, question, startAt);
  const played = actGame(answering, set, answering.defenderId, { type: 'play-skill', cardId: 'extra-time-test' }, startAt + 300);
  assert.equal(played.phaseDeadline, answering.phaseDeadline! + 10_000 + 3_000);
});

test('an attack skill does not eat into the answer time while its animation plays', () => {
  const initial = createGame(set, ['alpha', 'beta'], startAt);
  const question = selected(initial);
  initial.hands[initial.attackerId].push({ id: 'rush-test', kind: 'rush', acquiredTurn: 0 });
  const chosen = actGame(initial, set, initial.attackerId, { type: 'choose-question', questionId: question.id }, startAt + 100);
  const answering = actGame(chosen, set, chosen.attackerId, { type: 'play-skill', cardId: 'rush-test' }, startAt + 200);
  assert.equal(answering.phase, 'answer');
  assert.equal(answering.phaseDeadline, startAt + 200 + 7_000 + 3_000);
  const plain = createGame(set, ['alpha', 'beta'], startAt);
  const passed = openAnswer(plain, selected(plain), startAt);
  assert.equal(passed.phaseDeadline, startAt + 200 + 15_000);
});

test('Nullify can cancel a defender card played during the answer while preserving answer time', () => {
  const initial = createGame(set, ['alpha', 'beta'], startAt);
  const question = selected(initial);
  initial.hands[initial.defenderId].push({ id: 'hint-test', kind: 'hint', acquiredTurn: 0 });
  initial.hands[initial.attackerId].push({ id: 'nullify-test', kind: 'nullify', acquiredTurn: 0 });
  const answering = openAnswer(initial, question, startAt);
  const reacted = actGame(answering, set, answering.defenderId, { type: 'play-skill', cardId: 'hint-test' }, startAt + 300);
  assert.equal(reacted.phase, 'reaction');
  assert.equal(reacted.answerRemainingMs, answering.phaseDeadline! - (startAt + 300));
  const resumed = actGame(reacted, set, answering.attackerId, { type: 'nullify', targetCardId: 'hint-test' }, startAt + 500);
  assert.equal(resumed.phase, 'answer');
  assert.equal(resumed.cancelledSkillId, 'hint-test');
  assert.equal(resumed.phaseDeadline, startAt + 500 + reacted.answerRemainingMs! + 3_000);
});

test('an admin can pause the clock but cannot submit a team answer', () => {
  const initial = createGame(set, ['alpha', 'beta'], startAt);
  const deadline = initial.phaseDeadline!;
  const paused = actGame(initial, set, 'admin', { type: 'pause' }, startAt + 3_000);
  assert.equal(paused.paused, true);
  assert.equal(advanceGame(paused, set, deadline + 100_000).phase, 'question');
  const resumed = actGame(paused, set, 'admin', { type: 'resume' }, deadline + 100_000);
  assert.equal(resumed.phaseDeadline, deadline + 100_000 + (deadline - (startAt + 3_000)));
  assert.throws(() => actGame(resumed, set, 'admin', { type: 'choose-question', questionId: resumed.candidates[0] }, deadline + 100_001), /Admin chỉ theo dõi/);
});

test('a team cannot act for its opponent', () => {
  const initial = createGame(set, ['alpha', 'beta'], startAt);
  assert.throws(() => actGame(initial, set, initial.defenderId, { type: 'choose-question', questionId: initial.candidates[0] }, startAt + 100), /Chưa tới lượt/);
});

test('answer and skill events carry structured detail for viewer effects', () => {
  const initial = createGame(set, ['alpha', 'beta'], startAt);
  const question = selected(initial);
  const answering = openAnswer(initial, question, startAt);
  const revealed = actGame(answering, set, answering.defenderId, { type: 'answer', answerId: wrongOf(question, answering) }, startAt + 500);
  const result = revealed.events.findLast((event) => event.type === 'answer-result');
  assert.equal(result?.outcome, 'wrong');
  assert.equal(result?.damage, 60);
  assert.equal(result?.teamId, answering.defenderId);
});

test('fill-in questions deal six answer cards including the correct one', () => {
  for (let round = 0; round < 20; round++) {
    const initial = createGame(set, ['alpha', 'beta'], startAt);
    const fill = set.questions.find((item) => item.kind === 'fill' && initial.candidates.includes(item.id));
    if (!fill || fill.kind !== 'fill') continue;
    const chosen = actGame(initial, set, initial.attackerId, { type: 'choose-question', questionId: fill.id }, startAt + 100);
    assert.equal(chosen.answerBoard.length, 6);
    assert.ok(chosen.answerBoard.includes(fill.answerId));
    assert.equal(new Set(chosen.answerBoard).size, 6);
    return;
  }
  assert.fail('no fill-in question was dealt in 20 games');
});

test('an answer clicked before the deadline still counts when the request arrives late', () => {
  const initial = createGame(set, ['alpha', 'beta'], startAt);
  const question = selected(initial);
  const answering = openAnswer(initial, question, startAt);
  const deadline = answering.phaseDeadline!;
  // Other viewers polling inside the grace must not close the answer as a timeout.
  assert.equal(advanceGame(answering, set, deadline + ANSWER_LATENCY_MS - 1).phase, 'answer');
  const late = actGame(answering, set, answering.defenderId, { type: 'answer', answerId: answerOf(question), at: deadline - 500 }, deadline + 2_000);
  assert.equal(late.answerCorrect, true);
  assert.equal(late.hp[answering.defenderId], 300);
});

test('a click after the deadline, or a click time older than the grace, is refused', () => {
  const initial = createGame(set, ['alpha', 'beta'], startAt);
  const question = selected(initial);
  const answering = openAnswer(initial, question, startAt);
  const deadline = answering.phaseDeadline!;
  assert.throws(() => actGame(answering, set, answering.defenderId, { type: 'answer', answerId: answerOf(question), at: deadline + 100 }, deadline + 500), /hết giờ/);
  // A forged early click time is clamped to the grace window, which already lies past the deadline.
  assert.throws(() => actGame(answering, set, answering.defenderId, { type: 'answer', answerId: answerOf(question), at: startAt }, deadline + ANSWER_LATENCY_MS), /hết giờ|Chưa tới lượt/);
  assert.equal(advanceGame(answering, set, deadline + ANSWER_LATENCY_MS).answerCorrect, false);
});

