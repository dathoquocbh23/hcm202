'use client';

import type { CSSProperties } from 'react';
import { phaseLabel, remainingSeconds, teamName, type PublicGame, type RoomView } from '../client';
import { CardIcon } from './game-cards';
import { MatchFxLayer, useMatchFx, useTweenedNumber, type Fx } from './match-effects';

interface Props {
  room: RoomView;
  game: PublicGame;
  teamIds: [string, string];
  ownId: string | null;
  spectator: boolean;
  now: number;
  onContinue?: () => void;
  /** Pin effects to the viewport so they stay above a team's private choice sheet. */
  fxFixed?: boolean;
  /** Hide the phase timeline, used by the split live view. */
  compact?: boolean;
}

function Hud({ place, name, attacking, hp, color, hits }: { place: 'far' | 'near'; name: string; attacking: boolean; hp: number; color: string; hits: Extract<Fx, { kind: 'result' }>[] }) {
  const shown = useTweenedNumber(hp);
  const width = `${Math.max(0, Math.min(100, hp / 3))}%`;
  const hit = hits.at(-1);
  return <div className={`desk-hud ${place} ${hit ? 'hit' : ''} ${hp <= 60 ? 'critical' : ''}`} key={hit?.id} style={hit ? { '--d': `${hit.delay}ms` } as CSSProperties : undefined}>
    <div><strong>{name}</strong><small>{attacking ? '⚔ ĐANG TẤN CÔNG' : '🛡 ĐANG PHÒNG THỦ'}</small></div><b>{shown} <small>HP</small></b>
    <div className="hud-track"><span className="hud-ghost" style={{ width }} /><span className={`hud-fill ${color}`} style={{ width }} /></div>
    {hits.map((item) => <span className="hud-damage" key={item.id} style={{ '--d': `${item.delay + 350}ms` } as CSSProperties}>−{item.damage}</span>)}
  </div>;
}

export function DeskOverview({ room, game, teamIds, ownId, spectator, now, onContinue, fxFixed = false, compact = false }: Props) {
  const bottomId = ownId && teamIds.includes(ownId) ? ownId : teamIds[1];
  const topId = teamIds.find((id) => id !== bottomId) ?? teamIds[0];
  const activeName = game.phase === 'question' || game.phase === 'attack-skill' ? teamName(room, game.attackerId) : teamName(room, game.defenderId);
  const clock = remainingSeconds(game, now);
  const submittedText = game.submittedAnswerId ? game.activeQuestion?.kind === 'abc'
    ? `${game.submittedAnswerId}. ${game.activeQuestion.options?.[game.submittedAnswerId as 'A' | 'B' | 'C'] ?? ''}`
    : game.answerCards.find((card) => card.id === game.submittedAnswerId)?.text ?? 'Thẻ đáp án đã chọn' : null;
  // Options stay public; the correct one is only marked once the server reveals it.
  const choiceState = (id: string, removed = false) => game.correctAnswer === id ? 'is-correct' : game.submittedAnswerId === id || game.firstWrongId === id ? 'is-wrong' : removed ? 'is-removed' : '';
  const choices = game.activeQuestion?.kind === 'abc'
    ? (['A', 'B', 'C'] as const).map((key) => ({ id: key, label: `${key}. ${game.activeQuestion?.options?.[key] ?? ''}`, state: choiceState(key, game.removedOptionIds.includes(key)) }))
    : game.answerCards.map((card) => ({ id: card.id, label: card.text, state: choiceState(card.id) }));
  const last = game.lastAnswer;
  const bottomTeam = room.teams.find((team) => team.id === bottomId);
  const topTeam = room.teams.find((team) => team.id === topId);
  const nameOf = (id?: string | null) => teamName(room, id);
  const fx = useMatchFx(game.events, teamIds, nameOf);
  const hitsOn = (id: string) => fx.filter((item): item is Extract<Fx, { kind: 'result' }> => item.kind === 'result' && item.defenderId === id && item.damage > 0);
  const shake = fx.find((item) => item.kind === 'result' && item.outcome !== 'correct');

  return <div className="desk-screen"><div className="desk-statusbar"><span>{spectator ? 'GÓC NHÌN KHÁN GIẢ' : 'BÀN HỌC CỦA ĐỘI BẠN'}</span><span>Đang {phaseLabel(game.phase).toLowerCase()}{clock !== null ? ` · ${clock} giây` : ''}{game.paused ? ' · Đã tạm dừng' : ''}</span></div>
    <div className={`desk-scene ${shake ? 'fx-shake' : ''}`} style={shake ? { '--d': `${shake.delay}ms` } as CSSProperties : undefined}>
      <Hud place="far" name={nameOf(topId)} attacking={game.attackerId === topId} hp={game.hp[topId]} color={topTeam?.color ?? 'red'} hits={hitsOn(topId)} />
      <div className="desk-hand far-hand" aria-label={`${game.handCounts[topId]} thẻ úp của đội ở phía trên`}>{Array.from({ length: game.handCounts[topId] }, (_, index) => <div className="back-card" key={index}>✦</div>)}</div>
      <div className="study-table"><div className="table-notebook" aria-hidden="true" /><div className="table-pencil" aria-hidden="true" /><div className="table-ruler" aria-hidden="true" />
        <div className="table-mat"><div className="table-divider" /><div className="table-seal">✦</div><div className="card-slot upper-left" /><div className="card-slot upper-right" /><div className="card-slot lower-left" /><div className="card-slot lower-right" />
          {game.activeQuestion ? <div className="table-question paper-card"><small>📜 {game.activeQuestion.id}</small><span>THẺ CÂU HỎI</span><strong>{game.activeQuestion.kind === 'abc' ? 'Trắc nghiệm ABC' : 'Điền khuyết'}</strong></div> : <div className="table-question empty-card">Chờ câu hỏi</div>}
          {game.attackSkill && <div className={`table-skill-card table-attack-skill cat-attack ${game.attackSkill.cancelled ? 'crossed' : ''}`} aria-label={`Thẻ kỹ năng công ${game.attackSkill.name}`}><span>⚔</span><small>KỸ NĂNG CÔNG</small><strong>{game.attackSkill.name}</strong><em>✦</em></div>}
          {game.defenseSkill && <div className={`table-skill-card table-defense-skill cat-defense ${game.defenseSkill.cancelled ? 'crossed' : ''}`} aria-label={`Thẻ kỹ năng thủ ${game.defenseSkill.name}`}><span>✦</span><small>KỸ NĂNG THỦ</small><strong>{game.defenseSkill.name}</strong><em>✦</em></div>}
          {game.submittedAnswerId && game.answerCorrect !== null ? <div className={`table-answer paper-card ${game.answerCorrect ? 'answer-success' : 'answer-failure'}`}><small>THẺ ĐÃ CHỐT</small><strong>{submittedText}</strong></div> : <div className="table-answer empty-card">Vùng thẻ đáp án</div>}
        </div><div className="table-deck back-card">✦<small>{game.questionDeckCount} thẻ</small></div><div className="table-discard">⌑<small>{game.skillDiscardCount} đã dùng</small></div></div>
      <Hud place="near" name={nameOf(bottomId)} attacking={game.attackerId === bottomId} hp={game.hp[bottomId]} color={bottomTeam?.color ?? 'blue'} hits={hitsOn(bottomId)} />
      <div className="desk-hand near-hand">{spectator || !game.private ? Array.from({ length: game.handCounts[bottomId] }, (_, index) => <div className="back-card" key={index}>✦</div>) : game.private.hand.map((card) => <div className={`hand-paper cat-${card.category}`} key={card.id}><small>{card.category === 'attack' ? 'CÔNG' : card.category === 'reaction' ? 'PHẢN ĐÒN' : 'THỦ'}</small><span className="hand-paper-emblem"><CardIcon name={card.kind} size={18} /></span><strong>{card.name}</strong></div>)}</div>
      {!fxFixed && <MatchFxLayer fx={fx} teamName={nameOf} sideOf={(id) => id === topId ? 'top' : 'bottom'} />}
      <div className="desk-scene-note">{game.phase === 'completed' ? `Chiến thắng: ${teamName(room, game.winnerId)}` : `Đang chờ ${activeName} · ${phaseLabel(game.phase)}`}</div>
    </div>
    <div className="desk-detail"><div><span className="eyebrow">CÂU HỎI ĐANG ĐÁNH{game.activeQuestion ? ` · ${game.activeQuestion.kind === 'abc' ? 'TRẮC NGHIỆM ABC' : 'ĐIỀN KHUYẾT'}` : ''}</span><p>{game.activeQuestion?.text ?? 'Đội tấn công đang chọn câu hỏi. Câu chưa được công khai.'}</p>{game.activeQuestion?.hint && <small>Gợi ý: {game.activeQuestion.hint}</small>}{choices.length > 0 && <div className={`desk-choices ${game.activeQuestion?.kind === 'abc' ? 'abc' : ''}`}>{choices.map((choice) => <span key={choice.id} className={choice.state}>{choice.label}</span>)}</div>}{last && <div className={`desk-last-answer ${last.outcome}`}><span className="eyebrow">ĐỘI THỦ ĐÃ CHỐT · LƯỢT {last.turn} · {last.questionId}</span><p><strong>{teamName(room, last.teamId)}</strong> {last.known ? last.submitted ? <>chọn <b>{last.submitted}</b></> : 'không chọn (hết giờ)' : ''} → <b>{last.outcome === 'correct' ? 'Đúng' : last.outcome === 'wrong' ? 'Sai' : 'Hết giờ'}</b>{last.outcome !== 'correct' && <> · Đáp án đúng: {last.correctAnswer}</>}{last.damage > 0 && ` · −${last.damage} HP`}</p></div>}</div><div className="desk-detail-actions">{onContinue && game.private?.canAct && <button className="button primary" onClick={onContinue}>Tiếp tục lượt của bạn →</button>}<span className="status-pill">Lượt {game.turn} · {phaseLabel(game.phase)}</span></div></div>
    {!compact && <div className="game-timeline"><span>CHỌN CÂU</span><span>KỸ NĂNG</span><span>PHẢN ĐÒN</span><span>TRẢ LỜI</span><span>KẾT QUẢ</span></div>}
    {fxFixed && <MatchFxLayer fixed fx={fx} teamName={nameOf} sideOf={(id) => id === topId ? 'top' : 'bottom'} />}
  </div>;
}
