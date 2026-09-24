// Run against a local server with: node tests/live-demo.mjs
// Creates a dedicated practice room, pauses for inspection after two turns,
// then finishes the semifinal when Enter is pressed in this terminal.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

const origin = 'http://127.0.0.1:3000';
const password = readFileSync('.env.local', 'utf8').match(/^ADMIN_PASSWORD=(.+)$/m)?.[1];
const set = JSON.parse(readFileSync('src/features/game/data/sample-set.json', 'utf8'));
assert.ok(password, 'ADMIN_PASSWORD is required in .env.local');

async function request(path, cookie = '', body) {
  const response = await fetch(`${origin}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store'
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${data.error ?? response.status}`);
  return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' };
}

const login = await request('/api/admin/session', '', { password });
const admin = login.cookie;
assert.ok(admin.startsWith('arena_admin='));
const created = await request('/api/rooms', admin, {
  title: `Demo hai đội thi đấu · ${new Date().toLocaleString('vi-VN')}`,
  practiceReuse: true
});
const code = created.data.code;
const route = `/api/rooms/${code}`;
const room = async (cookie) => (await request(route, cookie)).data;
const teams = [];

async function command(cookie, value) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await room(cookie);
    try {
      return (await request(`${route}/command`, cookie, {
        command: value, commandId: randomUUID(), expectedRevision: current.revision
      })).data;
    } catch (error) {
      if (!String(error).includes('Dữ liệu trận đã thay đổi') || attempt === 2) throw error;
    }
  }
}

for (const name of ['Đội Đỏ', 'Đội Xanh', 'Đội Vàng', 'Đội Trắng']) {
  const joined = await request(`${route}/join`, '', { name });
  teams.push({ id: joined.data.teamId, name, cookie: joined.cookie });
  await command(admin, { type: 'approve', teamId: joined.data.teamId });
  await command(joined.cookie, { type: 'ready', ready: true });
}

// Keep the simulated captain sessions present while the demo is paused.
const presence = setInterval(() => {
  void Promise.all(teams.map((team) => room(team.cookie))).catch((error) => console.error('Presence update failed:', error));
}, 4_000);
presence.unref();

assert.equal((await room(admin)).teams.filter((team) => team.status === 'approved').length, 4);
const bracket = await command(admin, { type: 'create-bracket' });
const firstMatch = bracket.matches.find((match) => match.round === 'semifinal-a');
const matchId = firstMatch.id;
const pair = firstMatch.teamIds;
await command(admin, { type: 'start-match', matchId });
const matchOf = (view) => view.matches.find((match) => match.id === matchId);
const teamOf = (id) => teams.find((team) => team.id === id);
const gameState = async () => matchOf(await room(admin)).game;

async function nextQuestion() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const game = await gameState();
    if (game.phase === 'question' || game.phase === 'completed') return game;
    if (game.phase === 'reward') {
      const owner = game.answerCorrect ? game.defenderId : game.attackerId;
      const other = pair.find((id) => id !== owner);
      await command(teamOf(other).cookie, { type: 'game', matchId, action: { type: 'pass' } });
    } else if (game.phase === 'overflow') {
      for (const team of teams.filter((item) => pair.includes(item.id))) {
        const own = matchOf(await room(team.cookie)).game.private;
        if (own?.hand.length > 2) {
          await command(team.cookie, { type: 'game', matchId, action: { type: 'discard', cardId: own.hand[0].id } });
          break;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('The next turn did not begin within 15 seconds.');
}

async function playTurn(correct) {
  const before = await nextQuestion();
  if (before.phase === 'completed') return false;
  const attacker = teamOf(before.attackerId);
  const defender = teamOf(before.defenderId);
  const privateView = matchOf(await room(attacker.cookie)).game;
  const questionId = privateView.private.candidates[0].id;
  await command(attacker.cookie, { type: 'game', matchId, action: { type: 'choose-question', questionId } });
  await command(attacker.cookie, { type: 'game', matchId, action: { type: 'pass' } });
  await command(defender.cookie, { type: 'game', matchId, action: { type: 'pass' } });
  const question = set.questions.find((item) => item.id === questionId);
  const answering = matchOf(await room(defender.cookie)).game;
  let answerId;
  if (question.kind === 'abc') {
    answerId = correct ? question.correctOption : ['A', 'B', 'C'].find((option) => option !== question.correctOption);
  } else {
    const answerText = set.answers.find((item) => item.id === question.answerId).text;
    answerId = answering.answerCards.find((card) => correct ? card.text === answerText : card.text !== answerText).id;
  }
  const result = await command(defender.cookie, { type: 'game', matchId, action: { type: 'answer', answerId } });
  const game = matchOf(result).game;
  assert.equal(game.answerCorrect, correct);
  console.log(`Lượt ${game.turn}: ${attacker.name} đánh ${questionId}; ${defender.name} ${correct ? 'trả lời đúng' : 'trả lời sai'}; HP ${game.hp[pair[0]]}–${game.hp[pair[1]]}.`);
  return true;
}

await playTurn(false);
await playTurn(true);
await nextQuestion();
await command(admin, { type: 'game', matchId, action: { type: 'pause' } });
const observed = await room(admin);
assert.equal(matchOf(observed).game.paused, true);
assert.equal(matchOf(observed).game.private, undefined);
console.log(`\nPHÒNG DEMO: ${code}`);
console.log(`TRẬN: ${matchId}`);
console.log(`ADMIN: ${origin}/rooms/${code}`);
console.log(`XEM TRỰC TIẾP: ${origin}/rooms/${code}/watch/${matchId}`);
console.log('Đã tạm dừng sau hai lượt. Mở màn hình Admin để xem HP, pha thi đấu và nhật ký.');

const input = createInterface({ input: process.stdin, output: process.stdout });
await input.question('Nhấn Enter để tiếp tục và chạy đến kết quả trận...');
input.close();
await command(admin, { type: 'game', matchId, action: { type: 'resume' } });
for (let turn = 0; turn < 20; turn++) {
  if ((await gameState()).phase === 'completed') break;
  await playTurn(false);
}
const final = await room(admin);
const match = matchOf(final);
assert.equal(match.status, 'completed');
assert.ok(match.game.winnerId);
clearInterval(presence);
console.log(`\nHOÀN TẤT: ${teamOf(match.game.winnerId).name} thắng trận bán kết.`);
console.log(`KẾT QUẢ: ${origin}/rooms/${code}/match/${matchId}/result`);
console.log('Phòng demo được giữ lại để xem trong Admin.');
