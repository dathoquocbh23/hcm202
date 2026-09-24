'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { GameCommand, GameEvent } from '../types';
import type { PublicGame, PublicQuestion, RoomView } from '../client';
import { DeskOverview } from './desk-overview';
import { FocusOverlay } from './focus-overlay';

const TEAM_A = 'demo-blue';
const TEAM_B = 'demo-red';
const ADMIN = 'demo-admin';
const questions: PublicQuestion[] = [
  { id: 'M01', kind: 'abc', text: 'Trong nghiên cứu khoa học, giả thuyết cần được kiểm chứng bằng gì?', options: { A: 'Dữ liệu và bằng chứng', B: 'Ý kiến số đông', C: 'Cảm giác cá nhân' }, hint: 'Hãy nghĩ về phương pháp khoa học.' },
  { id: 'M02', kind: 'abc', text: 'Bước nào giúp xác định nguồn tài liệu có đáng tin cậy?', options: { A: 'Chỉ nhìn tiêu đề', B: 'Kiểm tra tác giả, nguồn và ngày công bố', C: 'Đếm số lượt thích' }, hint: 'Đánh giá xuất xứ của thông tin.' }
];

const roomBase: RoomView = {
  code: 'DEMO', title: 'Bàn đấu mẫu · Hai đội', joinLocked: false, practiceReuse: true,
  revision: 1, serverTime: 0, viewer: { role: 'team', teamId: TEAM_A },
  teams: [
    { id: TEAM_A, name: 'Đội Xanh', color: 'blue', status: 'approved', ready: true, online: true, lastSeen: 0 },
    { id: TEAM_B, name: 'Đội Đỏ', color: 'red', status: 'approved', ready: true, online: true, lastSeen: 0 }
  ],
  matches: []
};

const stages = [
  { title: 'Bàn học trước lượt đấu', description: 'Hai đội cùng thấy bàn học 2.5D. Đội Xanh chuẩn bị đánh câu hỏi.', button: 'Bắt đầu lượt Đội Xanh →' },
  { title: 'Đội Xanh chọn câu hỏi', description: 'Bảng chọn riêng nổi trên bàn học. Đội Đỏ chưa thấy hai câu này.' },
  { title: 'Câu hỏi được đánh ra bàn', description: 'Cả hai đội đều thấy câu hỏi vừa chọn trên bàn học.', button: 'Chọn kỹ năng tấn công →' },
  { title: 'Đội Xanh chọn kỹ năng', description: 'Chọn một kỹ năng hoặc bỏ qua, trong khi bàn học vẫn hiện phía sau.' },
  { title: 'Chuyển lượt sang Đội Đỏ', description: 'Đội Xanh nhìn bàn học và chờ. Đội Đỏ sắp đọc câu hỏi và quyết định dùng kỹ năng.', button: 'Xem màn trả lời của Đội Đỏ →' },
  { title: 'Đội Đỏ đọc câu hỏi và chọn kỹ năng', description: 'Đọc câu hỏi, chọn đáp án hoặc dùng Gợi Ý/Thu Hẹp ngay cạnh nút Chốt đáp án.' },
  { title: 'Thẻ kỹ năng được đặt lên bàn', description: 'Thẻ Đội Đỏ vừa dùng nằm trên bàn học chung; nhấn tiếp để xem tác dụng khi trả lời.', button: 'Tiếp tục trả lời →' },
  { title: 'Đội Đỏ chốt đáp án', description: 'Gợi Ý mở dòng gợi ý; Thu Hẹp bỏ một phương án sai. Đội Đỏ tiếp tục trả lời.' },
  { title: 'Công khai kết quả', description: 'Đáp án và HP hiện trên bàn học chung. Hãy thử đổi giữa hai đội và Admin.', button: 'Chơi lại từ đầu ↻' }
] as const;

function makeGame(step: number, viewAs: string, question: PublicQuestion, attackSkillPlayed: boolean, defenseSkillId: string | null, answerId: string | null, run: number): PublicGame {
  const hasQuestion = step >= 2;
  const revealed = step === 8;
  const phase = step <= 1 ? 'question' : step <= 3 ? 'attack-skill' : step <= 7 ? 'answer' : 'reveal';
  const correctId = question.id === 'M01' ? 'A' : 'B';
  const isCorrect = answerId === correctId;
  const acting = step <= 3 ? TEAM_A : TEAM_B;
  const activeQuestion = hasQuestion ? { ...question, hint: step >= 6 && defenseSkillId === 'demo-hint' ? question.hint : undefined } : null;
  const removedOptionIds = step >= 6 && defenseSkillId === 'demo-narrow' ? [question.id === 'M01' ? 'C' : 'A'] : [];
  // Synthetic log entries drive the same effects a real match shows; ids change per run so replays animate.
  const events: GameEvent[] = [];
  const log = (key: string, event: Omit<GameEvent, 'id' | 'at' | 'turn'>) => events.push({ id: `demo-${run}-${key}`, at: 0, turn: 1, ...event });
  if (step >= 1) log('turn', { type: 'turn', text: 'Bắt đầu lượt 1.', teamId: TEAM_A });
  if (step >= 4 && attackSkillPlayed) log('attack', { type: 'skill', text: 'Đội dùng kỹ năng Tốc Chiến.', teamId: TEAM_A, skill: 'rush' });
  if (step >= 6 && defenseSkillId) log('defense', { type: 'skill', text: 'Đội dùng kỹ năng thủ.', teamId: TEAM_B, skill: defenseSkillId === 'demo-hint' ? 'hint' : 'narrow' });
  if (revealed) log('result', { type: 'answer-result', text: isCorrect ? 'Trả lời đúng' : 'Trả lời sai', teamId: TEAM_B, outcome: isCorrect ? 'correct' : 'wrong', damage: isCorrect ? 0 : 60 });
  return {
    phase, phaseDeadline: null, paused: false, pausedRemainingMs: null, turn: 1,
    attackerId: TEAM_A, defenderId: TEAM_B,
    hp: { [TEAM_A]: 300, [TEAM_B]: revealed && !isCorrect ? 240 : 300 },
    handCounts: { [TEAM_A]: attackSkillPlayed ? 1 : 2, [TEAM_B]: defenseSkillId ? 1 : 2 },
    questionDeckCount: hasQuestion ? 17 : 18, skillDeckCount: 10, skillDiscardCount: 0,
    activeQuestion, answerCards: [], removedOptionIds, firstWrongId: null,
    submittedAnswerId: revealed ? answerId : null, answerCorrect: revealed ? isCorrect : null,
    correctAnswer: revealed ? correctId : null,
    attackSkill: attackSkillPlayed ? { id: 'demo-rush', name: 'Tốc Chiến', cancelled: false } : null,
    defenseSkill: defenseSkillId ? { id: defenseSkillId, name: defenseSkillId === 'demo-hint' ? 'Gợi Ý' : 'Thu Hẹp', cancelled: false } : null,
    winnerId: null, victoryReason: null,
    correctCounts: { [TEAM_A]: 0, [TEAM_B]: revealed && isCorrect ? 1 : 0 },
    defendedCounts: { [TEAM_A]: 0, [TEAM_B]: revealed && isCorrect ? 1 : 0 },
    elapsedActiveMs: 0, events,
    private: viewAs === ADMIN ? undefined : {
      hand: viewAs === TEAM_A ? [
        { id: 'demo-rush', kind: 'rush' as const, name: 'Tốc Chiến', category: 'attack', description: 'Rút ngắn thời gian trả lời của đối thủ.', available: !attackSkillPlayed },
        { id: 'demo-double', kind: 'double-strike' as const, name: 'Đòn Đôi', category: 'attack', description: 'Tăng sát thương nếu đối thủ trả lời sai.', available: !attackSkillPlayed }
      ].filter((card) => !attackSkillPlayed || card.id !== 'demo-rush') : [
        { id: 'demo-hint', kind: 'hint' as const, name: 'Gợi Ý', category: 'defense', description: 'Mở dòng gợi ý của câu hỏi.', available: !defenseSkillId },
        { id: 'demo-narrow', kind: 'narrow' as const, name: 'Thu Hẹp', category: 'defense', description: 'Loại một phương án ABC sai.', available: !defenseSkillId }
      ].filter((card) => card.id !== defenseSkillId),
      candidates: step <= 1 && viewAs === TEAM_A ? questions : [], reward: null,
      canAct: step !== 8 && viewAs === acting
    }
  };
}

export function DemoFlow() {
  const [step, setStep] = useState(0);
  const [viewAs, setViewAs] = useState(TEAM_A);
  const [questionId, setQuestionId] = useState(questions[0].id);
  const [attackSkillPlayed, setAttackSkillPlayed] = useState(false);
  const [defenseSkillId, setDefenseSkillId] = useState<string | null>(null);
  const [answerId, setAnswerId] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [run, setRun] = useState(0);
  const question = questions.find((item) => item.id === questionId) ?? questions[0];
  const room: RoomView = { ...roomBase, viewer: viewAs === ADMIN ? { role: 'admin' } : { role: 'team', teamId: viewAs } };
  const game = makeGame(step, viewAs, question, attackSkillPlayed, defenseSkillId, answerId, run);
  const activeStep = step === 1 || step === 3 || step === 5 || step === 7;
  const canFocus = Boolean(activeStep && game.private?.canAct);
  const showFocus = canFocus && !minimized;

  function reset() {
    setStep(0); setViewAs(TEAM_A); setQuestionId(questions[0].id);
    setAttackSkillPlayed(false); setDefenseSkillId(null); setAnswerId(null); setMinimized(false); setRun((value) => value + 1);
  }

  function advance() {
    if (step === 8) { reset(); return; }
    if (step === 0 || step === 2 || step === 4 || step === 6) {
      if (step === 4) setViewAs(TEAM_B);
      setMinimized(false); setStep(step + 1);
    }
  }

  function jumpToAnswer() {
    setStep(5); setViewAs(TEAM_B); setQuestionId(questions[0].id);
    setAttackSkillPlayed(false); setDefenseSkillId(null); setAnswerId(null); setMinimized(false); setRun((value) => value + 1);
  }

  async function act(action: GameCommand) {
    if (step === 1 && action.type === 'choose-question') {
      setQuestionId(action.questionId); setStep(2);
    } else if (step === 3 && (action.type === 'play-skill' || action.type === 'pass')) {
      setAttackSkillPlayed(action.type === 'play-skill'); setStep(4);
    } else if (step === 5 && action.type === 'play-skill') {
      setDefenseSkillId(action.cardId); setStep(6);
    } else if ((step === 5 || step === 7) && action.type === 'answer') {
      setAnswerId(action.answerId); setStep(8);
    }
    setMinimized(false);
  }

  return <main className="match-page demo-flow-page">
    <header className="match-topbar demo-topbar">
      <div><Link href="/" className="back-link">← Trang chủ</Link><span className="match-breadcrumb">Xem thử · Bàn học 2.5D</span></div>
      <div className="demo-view-switch" aria-label="Đổi góc nhìn đội chơi">
        <button type="button" className={viewAs === TEAM_A ? 'active' : ''} onClick={() => { setViewAs(TEAM_A); setMinimized(false); }}>Đội Xanh</button>
        <button type="button" className={viewAs === TEAM_B ? 'active' : ''} onClick={() => { setViewAs(TEAM_B); setMinimized(false); }}>Đội Đỏ</button>
        <button type="button" className={viewAs === ADMIN ? 'active' : ''} onClick={() => { setViewAs(ADMIN); setMinimized(false); }}>Admin theo dõi</button>
      </div>
      <button type="button" className="button small outline demo-reset" onClick={reset}>Làm lại ↻</button>
    </header>
    <div className="demo-guide"><div><span className="eyebrow">BẢN XEM THỬ · BƯỚC {step + 1}/{stages.length}</span><h1>{stages[step].title}</h1><p>{viewAs === ADMIN ? 'Admin chỉ theo dõi bàn học và HP công khai; không thấy bảng chọn hay thẻ riêng của đội. ' : ''}{stages[step].description}</p>{step === 8 && <p className="demo-outcome">{answerId === (question.id === 'M01' ? 'A' : 'B') ? 'Đội Đỏ trả lời đúng · HP giữ nguyên.' : `Đội Đỏ trả lời sai · mất 60 HP. Đáp án đúng: ${question.id === 'M01' ? 'A. Dữ liệu và bằng chứng' : 'B. Kiểm tra tác giả, nguồn và ngày công bố'}.`}</p>}</div>
      {'button' in stages[step] && <div className="demo-guide-actions"><button type="button" className="button primary" onClick={advance}>{stages[step].button}</button>{step === 0 && <button type="button" className="button outline" onClick={jumpToAnswer}>Xem ngay lúc trả lời →</button>}</div>}
      {activeStep && !canFocus && <button type="button" className="button primary" onClick={() => { setViewAs(step >= 5 ? TEAM_B : TEAM_A); setMinimized(false); }}>Xem thiết bị đội đang chọn →</button>}
      {activeStep && canFocus && minimized && <button type="button" className="button primary" onClick={() => setMinimized(false)}>Mở lại bảng chọn →</button>}
    </div>
    <div aria-hidden={showFocus}><DeskOverview room={room} game={game} teamIds={[TEAM_A, TEAM_B]} ownId={viewAs === ADMIN ? null : viewAs} spectator={viewAs === ADMIN} now={Date.now()} onContinue={canFocus && !showFocus ? () => setMinimized(false) : undefined} /></div>
    {showFocus && <FocusOverlay room={room} game={game} teamId={viewAs} now={Date.now()} busy={false} onAction={act} onMinimize={() => setMinimized(true)} demo />}
    <div className="demo-footnote">Bản xem thử dùng dữ liệu mẫu và không lưu kết quả. Trận thật dùng cùng màn hình bàn học và bảng chọn này.</div>
  </main>;
}
