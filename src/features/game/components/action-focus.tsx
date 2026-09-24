'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { phaseLabel, remainingSeconds, teamName, type PublicGame, type RoomView } from '../client';
import type { GameCommand } from '../types';
import { AnswerCardFace, CardIcon, QuestionCardFace, QuestionText, SkillCardFace, fanStyle, skillByName } from './game-cards';

interface Props {
  room: RoomView; game: PublicGame; teamId: string; now: number; busy: boolean;
  onAction: (action: GameCommand) => Promise<void>;
  onMinimize: () => void;
  demo?: boolean;
}

interface Choice { id: string; label: string }

export function ActionFocus({ room, game, teamId, now, busy, onAction, onMinimize, demo = false }: Props) {
  const [selected, setSelected] = useState('');
  const [selectedSkill, setSelectedSkill] = useState('');
  const phase = game.phase;
  const own = game.private!;
  const clock = remainingSeconds(game, now);
  const attacker = teamId === game.attackerId;
  const eligibleSkills = useMemo(() => own.hand.filter((card) => card.available && (phase === 'attack-skill' ? card.category === 'attack' && !(card.kind === 'confusion' && game.activeQuestion?.kind === 'abc') : phase === 'defense-skill' || phase === 'answer' ? card.category === 'defense' : phase === 'reaction' || phase === 'steal-cancel' ? card.kind === 'nullify' : phase === 'reward' ? card.kind === 'steal' : true)), [own.hand, phase, game.activeQuestion?.kind]);
  useEffect(() => { setSelected(''); setSelectedSkill(''); }, [phase, game.activeQuestion?.id, game.defenseSkill?.id]);

  async function submit(command: GameCommand) { await onAction(command); }

  let heading = phaseLabel(phase);
  let instruction = '';
  if (phase === 'question') instruction = 'Hai thẻ này chỉ đội bạn thấy. Chọn một câu để đánh ra bàn học.';
  else if (phase === 'attack-skill') instruction = 'Chọn tối đa một kỹ năng công hoặc bỏ qua. Đội thủ có thể dùng kỹ năng khi đọc câu hỏi.';
  else if (phase === 'defense-skill') instruction = 'Chọn một kỹ năng thủ hoặc bỏ qua trước khi bắt đầu trả lời.';
  else if (phase === 'reaction') instruction = 'Có thể Vô Hiệu một kỹ năng vừa được đối thủ đánh, hoặc bỏ qua.';
  else if (phase === 'answer' || phase === 'second-answer') instruction = phase === 'second-answer' ? 'Lần đầu chưa đúng. Chọn một đáp án khác trong thời gian còn lại.' : game.defenseSkill ? 'Kỹ năng thủ đã được đặt lên bàn. Tiếp tục chọn và chốt đáp án.' : demo ? 'Đọc câu hỏi, chọn đáp án hoặc dùng một kỹ năng thủ ngay tại đây. Bản xem thử không giới hạn thời gian.' : 'Đọc câu hỏi, chọn đáp án hoặc dùng một kỹ năng thủ trước khi đồng hồ hết giờ.';
  else if (phase === 'reward') instruction = 'Đối thủ vừa rút một kỹ năng. Dùng Đánh Cắp hoặc bỏ qua.';
  else if (phase === 'steal-cancel') instruction = 'Đối thủ dùng Đánh Cắp. Bạn có thể Vô Hiệu hoặc bỏ qua.';
  else if (phase === 'overflow') instruction = 'Bạn đang cầm quá hai thẻ. Chọn một thẻ để bỏ.';
  else if (phase === 'sudden') instruction = 'Cả hai đội cùng trả lời. Đội gửi đáp án đúng trước thắng.';

  const question = game.activeQuestion;
  const answering = phase === 'answer' || phase === 'second-answer' || phase === 'sudden';
  const abcOptions = question?.kind === 'abc' ? (['A', 'B', 'C'] as const).map((letter) => ({ id: letter, text: question.options?.[letter] ?? '', removed: game.removedOptionIds.includes(letter), wrong: game.firstWrongId === letter })) : [];
  const answerOptions = question?.kind === 'abc'
    ? abcOptions.filter((option) => !option.removed && !option.wrong)
    : game.answerCards.filter((card) => card.id !== game.firstWrongId);
  const reactionTargets = [game.attackSkill, game.defenseSkill].filter((skill) => skill && !skill.cancelled && (attacker ? skill === game.defenseSkill : skill === game.attackSkill)) as NonNullable<PublicGame['attackSkill']>[];

  // What the number keys pick in this phase, and how the pick reads in the confirm bar.
  const choices: Choice[] = phase === 'question' ? own.candidates.map((candidate) => ({ id: candidate.id, label: `${candidate.id} · ${candidate.text}` }))
    : phase === 'attack-skill' || phase === 'defense-skill' ? eligibleSkills.map((card) => ({ id: card.id, label: card.name }))
    : phase === 'reaction' ? reactionTargets.map((skill) => ({ id: skill.id, label: `Vô Hiệu ${skill.name}` }))
    : phase === 'overflow' ? own.hand.map((card) => ({ id: card.id, label: `Bỏ ${card.name}` }))
    : answering ? answerOptions.map((option) => ({ id: option.id, label: question?.kind === 'abc' ? `${option.id}. ${option.text}` : option.text }))
    : [];
  const selectedLabel = choices.find((choice) => choice.id === selected)?.label;
  const selectedFill = question?.kind === 'fill' ? game.answerCards.find((card) => card.id === selected)?.text : null;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || busy) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const key = event.key.toUpperCase();
      const letterPick = question?.kind === 'abc' && answering && ['A', 'B', 'C'].includes(key) ? choices.find((choice) => choice.id === key) : undefined;
      const digit = Number(event.key);
      const digitPick = Number.isInteger(digit) && digit >= 1 && !(answering && question?.kind === 'abc') ? choices[digit - 1] : undefined;
      const pick = letterPick ?? digitPick;
      if (pick) { event.preventDefault(); setSelected(pick.id); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choices, answering, question?.kind, busy]);

  const keyFor = (id: string) => { const index = choices.findIndex((choice) => choice.id === id); return index >= 0 && index < 9 ? String(index + 1) : undefined; };
  const toggle = (id: string) => setSelected((current) => current === id ? '' : id);
  const actionButton = (label: string, command: GameCommand, disabled = false, secondary = false) => <button className={`button ${secondary ? 'outline' : 'primary'}`} disabled={busy || disabled} onClick={() => void submit(command)}>{busy ? 'Đang xác nhận…' : label}</button>;
  const selectionBar = (placeholder: string) => <div className={`focus-selection ${selectedLabel ? 'has-pick' : ''}`} aria-live="polite">{selectedLabel ? <><small>ĐÃ CHỌN</small><strong>{selectedLabel}</strong></> : <span>{placeholder}</span>}</div>;
  const urgent = !demo && clock !== null && clock <= 5 && !game.paused;

  return <section className={`focus-screen phase-${phase}`} aria-label="Bảng thao tác riêng của đội"><div className="focus-header"><div><span className="eyebrow">LƯỢT CỦA {teamName(room, teamId).toUpperCase()} · {attacker ? 'ĐỘI CÔNG' : 'ĐỘI THỦ'}</span><h1>{heading}</h1><p>{instruction}</p></div><div className={`focus-clock ${urgent ? 'urgent' : ''}`} role="timer"><strong>{demo ? '∞' : clock ?? '—'}</strong><small>{demo ? 'XEM THỬ · KHÔNG ĐẾM GIỜ' : 'GIÂY CÒN LẠI'}</small></div></div><div className="focus-privacy">⌑ Bảng chọn riêng của đội bạn. Bàn học vẫn ở phía sau; đối thủ và Admin chỉ thấy diễn biến công khai.</div>
    {phase === 'question' && <><div className={`card-hand questions ${selected ? 'has-selection' : ''}`}>{own.candidates.map((candidate, index) => <QuestionCardFace key={candidate.id} question={candidate} selected={selected === candidate.id} onSelect={() => toggle(candidate.id)} keyHint={keyFor(candidate.id)} style={fanStyle(index, own.candidates.length)} />)}</div><div className="focus-actions">{selectionBar('Chạm vào một thẻ câu hỏi')}{actionButton('Đánh câu hỏi này →', { type: 'choose-question', questionId: selected }, !selected)}</div></>}
    {(phase === 'attack-skill' || phase === 'defense-skill') && <><div className="focus-question-mini"><strong>{question?.id}</strong><span><QuestionText text={question?.text ?? ''} /></span></div><div className={`card-hand ${selected ? 'has-selection' : ''}`}>{eligibleSkills.length ? eligibleSkills.map((card, index) => <SkillCardFace key={card.id} kind={card.kind} name={card.name} category={card.category} description={card.description} selected={selected === card.id} onSelect={() => toggle(card.id)} keyHint={keyFor(card.id)} style={fanStyle(index, eligibleSkills.length)} />) : <p className="empty-state card-hand-empty">Bạn chưa có kỹ năng dùng được trong pha này.</p>}</div><div className="focus-actions">{selectionBar(eligibleSkills.length ? 'Chọn một thẻ kỹ năng, hoặc bỏ qua' : 'Không có thẻ phù hợp')}{actionButton('Dùng kỹ năng →', { type: 'play-skill', cardId: selected }, !selected)}{actionButton('Bỏ qua kỹ năng', { type: 'pass' }, false, true)}</div></>}
    {phase === 'reaction' && <><div className={`card-hand ${selected ? 'has-selection' : ''}`}>{reactionTargets.map((skill, index) => { const def = skillByName(skill.name); return <SkillCardFace key={skill.id} kind={def?.kind} name={skill.name} category={def?.category ?? 'attack'} description={def?.description ?? 'Kỹ năng đối thủ vừa đánh.'} selected={selected === skill.id} onSelect={() => toggle(skill.id)} keyHint={keyFor(skill.id)} stamp={selected === skill.id ? 'VÔ HIỆU' : undefined} style={fanStyle(index, reactionTargets.length)} />; })}</div><div className="focus-actions">{selectionBar('Chọn thẻ đối thủ muốn hủy')}{own.hand.some((card) => card.kind === 'nullify' && card.available) && actionButton('Dùng Vô Hiệu', { type: 'nullify', targetCardId: selected }, !selected)}{actionButton('Bỏ qua phản đòn', { type: 'pass' }, false, true)}</div></>}
    {answering && <>{phase !== 'sudden' && <div className="focus-phase-note">✦ {game.defenseSkill ? `Thẻ ${game.defenseSkill.name} ${game.defenseSkill.cancelled ? 'đã bị Vô Hiệu' : 'đã đặt trên bàn học'}` : eligibleSkills.length && phase === 'answer' ? 'Có thể dùng một thẻ kỹ năng thủ ngay trong lúc đọc câu hỏi.' : 'Chưa dùng kỹ năng thủ trong lượt này.'}</div>}
      <div className="focus-question"><span className="eyebrow">📜 {question?.id} · {question?.kind === 'abc' ? 'TRẮC NGHIỆM ABC' : 'ĐIỀN KHUYẾT'}</span><p><QuestionText text={question?.text ?? ''} fill={selectedFill} /></p>{question?.hint && <small className="focus-hint"><CardIcon name="hint" size={15} /> Gợi ý: {question.hint}</small>}</div>
      <h2 className="answer-heading">{question?.kind === 'abc' ? 'Chọn một phương án' : 'Bàn đáp án'} <small>{answerOptions.length} lựa chọn<span className="key-tip"> · bấm {question?.kind === 'abc' ? 'A/B/C' : 'phím số'} để chọn nhanh</span></small></h2>
      {question?.kind === 'abc'
        ? <div className={`answer-deck abc ${selected ? 'has-selection' : ''}`}>{abcOptions.map((option) => <AnswerCardFace key={option.id} letter={option.id} index={0} text={option.text} selected={selected === option.id} disabled={option.removed || option.wrong} stamp={option.removed ? 'ĐÃ LOẠI' : option.wrong ? 'ĐÃ SAI' : undefined} onSelect={() => toggle(option.id)} style={{ '--i': ['A', 'B', 'C'].indexOf(option.id) } as CSSProperties} />)}</div>
        : <div className={`answer-deck ${selected ? 'has-selection' : ''}`}>{answerOptions.map((option, index) => <AnswerCardFace key={option.id} index={index} text={option.text} selected={selected === option.id} onSelect={() => toggle(option.id)} keyHint={keyFor(option.id)} style={{ '--i': index } as CSSProperties} />)}</div>}
      {phase === 'answer' && !game.defenseSkill && eligibleSkills.length > 0 && <div className="focus-inline-skills"><span className="eyebrow">THẺ KỸ NĂNG THỦ · CHỌN THẺ RỒI BẤM DÙNG KỸ NĂNG</span><div>{eligibleSkills.map((card) => <SkillCardFace key={card.id} compact kind={card.kind} name={card.name} category={card.category} description={card.description} selected={selectedSkill === card.id} onSelect={() => setSelectedSkill((current) => current === card.id ? '' : card.id)} />)}</div></div>}
      <div className="focus-actions">{selectionBar(question?.kind === 'abc' ? 'Chọn A, B hoặc C' : 'Chọn một thẻ đáp án')}{actionButton(phase === 'sudden' ? 'Gửi đáp án đột tử →' : 'Chốt đáp án →', { type: 'answer', answerId: selected }, !selected || !answerOptions.some((option) => option.id === selected))}{phase === 'answer' && !game.defenseSkill && eligibleSkills.length > 0 && actionButton('Dùng kỹ năng →', { type: 'play-skill', cardId: selectedSkill }, !selectedSkill, true)}</div></>}
    {(phase === 'reward' || phase === 'steal-cancel') && <><div className="card-hand">{eligibleSkills.map((card, index) => <SkillCardFace key={card.id} kind={card.kind} name={card.name} category={card.category} description={card.description} style={fanStyle(index, eligibleSkills.length)} />)}</div><div className="focus-actions">{phase === 'reward' ? actionButton('Dùng Đánh Cắp', { type: 'steal' }) : actionButton('Dùng Vô Hiệu', { type: 'nullify', targetCardId: 'steal' })}{actionButton('Bỏ qua', { type: 'pass' }, false, true)}</div></>}
    {phase === 'overflow' && <><div className={`card-hand ${selected ? 'has-selection' : ''}`}>{own.hand.map((card, index) => <SkillCardFace key={card.id} kind={card.kind} name={card.name} category={card.category} description={card.description} selected={selected === card.id} onSelect={() => toggle(card.id)} keyHint={keyFor(card.id)} stamp={selected === card.id ? 'BỎ THẺ' : undefined} style={fanStyle(index, own.hand.length)} />)}</div><div className="focus-actions">{selectionBar('Chọn thẻ muốn bỏ')}{actionButton('Bỏ thẻ đã chọn', { type: 'discard', cardId: selected }, !selected)}</div></>}
    <button className="text-button focus-minimize" onClick={onMinimize}>Xem bàn học trong lúc suy nghĩ ↗</button>
  </section>;
}
