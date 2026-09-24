'use client';

import type { CSSProperties, ReactNode } from 'react';
import { SKILLS } from '../skills';
import type { SkillId } from '../types';
import type { PublicQuestion } from '../client';

type Category = 'attack' | 'defense' | 'reaction';

const ICON_PATHS: Record<SkillId | Category, ReactNode> = {
  hint: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.1V16h5v-.1c0-.8.4-1.5 1.1-2.1A6 6 0 0 0 12 3z" />,
  narrow: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  'second-chance': <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>,
  'extra-time': <><path d="M6 3h12M6 21h12" /><path d="M7 3v3l5 6-5 6v3M17 3v3l-5 6 5 6v3" /></>,
  'double-strike': <path d="m4 6 6 6-6 6M12 6l6 6-6 6" />,
  rush: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  confusion: <path d="M12 12a1.5 1.5 0 0 1 3 0 3 3 0 0 1-6 0 4.5 4.5 0 0 1 9 0 6 6 0 0 1-12 0" />,
  pierce: <><path d="M4 20 20 4M13 4h7v7" /><path d="m8 8 8 8" /></>,
  nullify: <><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>,
  steal: <path d="M6 3h4v8a2 2 0 0 0 4 0V3h4v8a6 6 0 0 1-12 0zM6 7h4M14 7h4" />,
  attack: <><path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6M16 16l4 4M19 21l2-2" /></>,
  defense: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
  reaction: <><path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2" /><path d="M20 4v4h-4M4 20v-4h4" /></>
};

export function CardIcon({ name, size = 24 }: { name: SkillId | Category; size?: number }) {
  return <svg className="card-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON_PATHS[name]}</svg>;
}

export const CATEGORY_LABEL: Record<Category, string> = { attack: 'KỸ NĂNG CÔNG', defense: 'KỸ NĂNG THỦ', reaction: 'PHẢN ĐÒN' };

export function skillByName(name: string) {
  return SKILLS.find((skill) => skill.name.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'));
}

function asCategory(value: string): Category {
  return value === 'attack' || value === 'reaction' ? value : 'defense';
}

/** Fans a hand of cards: middle card upright, outer cards tilted and slightly lowered. */
export function fanStyle(index: number, total: number): CSSProperties {
  const offset = index - (total - 1) / 2;
  return { '--i': index, '--rot': `${offset * 4}deg`, '--lift': `${Math.abs(offset) * 7}px` } as CSSProperties;
}

interface Selectable {
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  keyHint?: string;
  stamp?: string;
  style?: CSSProperties;
  compact?: boolean;
}

function CardShell({ className, selected, disabled, onSelect, keyHint, stamp, style, label, children }: Selectable & { className: string; label: string; children: ReactNode }) {
  const classes = `game-card ${className}${selected ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}${stamp ? ' is-stamped' : ''}`;
  const extras = <>{selected && <span className="card-check" aria-hidden="true">✓</span>}{keyHint && <kbd className="card-key" aria-hidden="true">{keyHint}</kbd>}{stamp && <span className="card-stamp">{stamp}</span>}</>;
  if (!onSelect) return <div className={classes} style={style} aria-label={label}>{children}{extras}</div>;
  return <button type="button" className={classes} style={style} aria-label={label} aria-pressed={selected} disabled={disabled} onClick={onSelect}>{children}{extras}</button>;
}

export function SkillCardFace({ kind, name, category, description, compact, ...rest }: Selectable & { kind?: SkillId; name: string; category: string; description: string }) {
  const cat = asCategory(category);
  return <CardShell {...rest} className={`skill-card cat-${cat}${compact ? ' compact' : ''}`} label={`${CATEGORY_LABEL[cat]} ${name}: ${description}`}>
    <span className="skill-card-band"><CardIcon name={cat} size={13} />{CATEGORY_LABEL[cat]}</span>
    <span className="skill-card-emblem"><CardIcon name={kind ?? cat} size={compact ? 20 : 30} /></span>
    <strong className="skill-card-name">{name}</strong>
    <span className="skill-card-desc">{description}</span>
    {!compact && <span className="skill-card-foot" aria-hidden="true">✦</span>}
  </CardShell>;
}

/** Renders "______" blanks as a slot that previews the chosen answer. */
export function QuestionText({ text, fill }: { text: string; fill?: string | null }) {
  const parts = text.split(/_{3,}/);
  if (parts.length === 1) return <>{text}</>;
  return <>{parts.map((part, index) => <span key={index}>{part}{index < parts.length - 1 && <span className={`q-blank${fill ? ' filled' : ''}`} key={fill ?? 'empty'}>{fill ?? ' '}</span>}</span>)}</>;
}

export function QuestionCardFace({ question, ...rest }: Selectable & { question: PublicQuestion }) {
  const abc = question.kind === 'abc';
  return <CardShell {...rest} className={`question-card kind-${question.kind}`} label={`Câu ${question.id}, ${abc ? 'trắc nghiệm' : 'điền khuyết'}: ${question.text}`}>
    <span className="question-card-top"><span className="question-card-id">{question.id}</span><span className="question-card-kind">{abc ? 'TRẮC NGHIỆM ABC' : 'ĐIỀN KHUYẾT'}</span></span>
    <span className="question-card-text"><QuestionText text={question.text} /></span>
    {abc && question.options && <span className="question-card-options">{(['A', 'B', 'C'] as const).map((letter) => <span key={letter}><b>{letter}</b>{question.options![letter]}</span>)}</span>}
    <span className="question-card-seal" aria-hidden="true">✦</span>
  </CardShell>;
}

export function AnswerCardFace({ letter, index, text, ...rest }: Selectable & { letter?: string; index: number; text: string }) {
  return <CardShell {...rest} className={letter ? 'answer-card abc' : 'answer-card'} label={`${letter ? `Phương án ${letter}` : `Thẻ ${index + 1}`}: ${text}`}>
    {letter ? <span className="answer-card-letter">{letter}</span> : <span className="answer-card-code">★{String(index + 1).padStart(2, '0')}</span>}
    <span className="answer-card-text">{text}</span>
  </CardShell>;
}
