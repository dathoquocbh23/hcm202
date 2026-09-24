'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { skillById } from '../skills';
import type { GameEvent, SkillId } from '../types';
import { CardIcon, SkillCardFace } from './game-cards';

type Outcome = 'correct' | 'wrong' | 'timeout';
type Tone = 'info' | 'warn' | 'purple';

type FxBody =
  | { id: string; kind: 'skill'; teamId: string; skill: SkillId }
  | { id: string; kind: 'result'; outcome: Outcome; defenderId: string; attackerId: string; damage: number }
  | { id: string; kind: 'toast'; text: string; tone: Tone; teamId?: string }
  | { id: string; kind: 'victory'; winnerId: string | null };
export type Fx = FxBody & { delay: number };

const DURATION: Record<Fx['kind'], number> = { skill: 1800, result: 2700, toast: 2300, victory: 4500 };
const STAGGER: Record<Fx['kind'], number> = { skill: 1100, result: 1300, toast: 450, victory: 0 };

/** Older stored events have no structured fields, so fall back to the log text. */
function outcomeOf(event: GameEvent): { outcome: Outcome; damage: number } {
  const damage = event.damage ?? Number(/(\d+) sát thương/.exec(event.text)?.[1] ?? 0);
  const outcome = event.outcome ?? (event.text.startsWith('Trả lời đúng') ? 'correct' : event.text.startsWith('Hết giờ') ? 'timeout' : 'wrong');
  return { outcome, damage };
}

function toFx(event: GameEvent, teamIds: [string, string], teamName: (id?: string | null) => string): FxBody | null {
  const other = (id?: string) => teamIds.find((item) => item !== id) ?? teamIds[0];
  switch (event.type) {
    case 'skill': return event.skill && event.teamId ? { id: event.id, kind: 'skill', teamId: event.teamId, skill: event.skill } : null;
    case 'answer-result': {
      const { outcome, damage } = outcomeOf(event);
      return { id: event.id, kind: 'result', outcome, damage, defenderId: event.teamId ?? teamIds[1], attackerId: other(event.teamId) };
    }
    case 'first-wrong': return { id: event.id, kind: 'toast', tone: 'warn', text: 'Sai lần 1 · Còn một cơ hội!' };
    case 'nullify': return { id: event.id, kind: 'toast', tone: 'purple', text: `${teamName(event.teamId)} Vô Hiệu kỹ năng đối thủ!` };
    case 'nullify-steal': return { id: event.id, kind: 'toast', tone: 'purple', text: 'Đánh Cắp đã bị Vô Hiệu!' };
    case 'steal': return { id: event.id, kind: 'toast', tone: 'purple', text: `${teamName(event.teamId)} Đánh Cắp thẻ kỹ năng!` };
    case 'sudden': return { id: event.id, kind: 'toast', tone: 'warn', text: 'ĐỘT TỬ · Hai đội cùng trả lời!' };
    case 'turn': return { id: event.id, kind: 'toast', tone: 'info', teamId: event.teamId, text: `Lượt ${event.turn} · ${teamName(event.teamId)} tấn công` };
    case 'completed': return { id: event.id, kind: 'victory', winnerId: event.teamId ?? null };
    default: return null;
  }
}

/**
 * Turns match events that arrive after mount into short-lived effects. History present on the
 * first render is only marked as seen, so opening or reloading a match never replays old hits.
 */
export function useMatchFx(events: GameEvent[] | undefined, teamIds: [string, string], teamName: (id?: string | null) => string): Fx[] {
  const seen = useRef<Set<string> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nameRef = useRef(teamName);
  nameRef.current = teamName;
  const [fx, setFx] = useState<Fx[]>([]);
  const [a, b] = teamIds;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (!events) return;
    if (!seen.current) { seen.current = new Set(events.map((event) => event.id)); return; }
    const fresh = events.filter((event) => !seen.current!.has(event.id));
    if (!fresh.length) return;
    fresh.forEach((event) => seen.current!.add(event.id));
    // A throttled background tab can deliver a long backlog; only animate the latest moments.
    const latest = Math.max(...fresh.map((event) => event.at));
    let delay = 0;
    const made: Fx[] = [];
    for (const event of fresh.filter((item) => latest - item.at < 6000).slice(-5)) {
      const item = toFx(event, [a, b], nameRef.current);
      if (!item) continue;
      made.push({ ...item, delay });
      delay += STAGGER[item.kind];
    }
    if (!made.length) return;
    setFx((current) => [...current, ...made]);
    for (const item of made) {
      timers.current.push(setTimeout(() => setFx((current) => current.filter((entry) => entry.id !== item.id)), item.delay + DURATION[item.kind]));
    }
  }, [events, a, b]);

  return fx;
}

const delayStyle = (fx: Fx) => ({ '--d': `${fx.delay}ms` }) as CSSProperties;
const CONFETTI = Array.from({ length: 28 }, (_, index) => ({
  left: `${(index * 37) % 100}%`, hue: ['#d6aa36', '#b65b55', '#398164', '#477c91', '#f3e2bf'][index % 5],
  delay: `${(index % 7) * 90}ms`, spin: `${(index % 2 ? 1 : -1) * (240 + index * 13)}deg`, drift: `${((index * 53) % 60) - 30}px`
}));

export function MatchFxLayer({ fx, teamName, sideOf, fixed = false }: {
  fx: Fx[];
  teamName: (id?: string | null) => string;
  sideOf: (teamId: string) => 'top' | 'bottom';
  fixed?: boolean;
}) {
  if (!fx.length) return null;
  const toasts = fx.filter((item): item is Extract<Fx, { kind: 'toast' }> => item.kind === 'toast');
  return <div className={`fx-layer ${fixed ? 'fixed' : ''}`} role="status" aria-live="polite">
    {toasts.length > 0 && <div className="fx-toasts">{toasts.map((item) => <div key={item.id} className={`fx-toast ${item.tone}`} style={delayStyle(item)}>{item.text}</div>)}</div>}
    {fx.filter((item) => item.kind !== 'toast').map((item) => {
      if (item.kind === 'skill') {
        const def = skillById[item.skill];
        return <div key={item.id} className={`fx-cast from-${sideOf(item.teamId)}`} style={delayStyle(item)}>
          <div className={`fx-cast-glow cat-${def.category}`} />
          <SkillCardFace kind={item.skill} name={def.name} category={def.category} description={def.description} />
          <span className="fx-caption">{teamName(item.teamId)} dùng kỹ năng</span>
        </div>;
      }
      if (item.kind === 'result') {
        const success = item.outcome === 'correct';
        const title = success ? 'CHÍNH XÁC!' : item.outcome === 'timeout' ? 'HẾT GIỜ!' : 'SAI RỒI!';
        const detail = success
          ? `${teamName(item.defenderId)} phòng thủ thành công${item.damage ? ` · vẫn mất ${item.damage} HP` : ''}`
          : `${teamName(item.attackerId)} tấn công thành công · −${item.damage} HP`;
        return <div key={item.id} className={`fx-result ${success ? 'good' : 'bad'}`} style={delayStyle(item)}>
          <div className="fx-rays" aria-hidden="true" />
          <div className="fx-result-badge"><CardIcon name={success ? 'defense' : 'attack'} size={38} /></div>
          <strong>{title}</strong>
          <span>{detail}</span>
        </div>;
      }
      if (item.kind !== 'victory') return null;
      return <div key={item.id} className="fx-victory" style={delayStyle(item)}>
        <div className="fx-confetti" aria-hidden="true">{CONFETTI.map((piece, index) => <i key={index} style={{ left: piece.left, background: piece.hue, animationDelay: piece.delay, '--spin': piece.spin, '--drift': piece.drift } as CSSProperties} />)}</div>
        <div className="fx-trophy" aria-hidden="true">🏆</div>
        <small>CHIẾN THẮNG</small>
        <strong>{teamName(item.winnerId)}</strong>
      </div>;
    })}
  </div>;
}

/** Counts HP down (or up) instead of jumping, so the hit reads on a projector. */
export function useTweenedNumber(value: number, duration = 650): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value) return;
    const began = performance.now();
    let frame = 0;
    const step = (time: number) => {
      const k = Math.min(1, (time - began) / duration);
      setShown(Math.round(start + (value - start) * (1 - (1 - k) ** 3)));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return shown;
}
