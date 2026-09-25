'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameCommand, GameEvent, GamePhase, Match, SkillId } from './types';
import type { RoomCommand } from '@/lib/server/room-store';

export interface PublicQuestion {
  id: string; kind: 'fill' | 'abc'; text: string;
  options?: Record<'A' | 'B' | 'C', string>; hint?: string;
}

export interface PrivateGame {
  hand: { id: string; kind: SkillId; name: string; category: string; description: string; available: boolean }[];
  candidates: PublicQuestion[];
  reward: { name: string } | null;
  canAct: boolean;
}

export interface PublicGame {
  phase: GamePhase; phaseDeadline: number | null; paused: boolean; pausedRemainingMs: number | null; turn: number;
  attackerId: string; defenderId: string; hp: Record<string, number>; handCounts: Record<string, number>;
  questionDeckCount: number; skillDeckCount: number; skillDiscardCount: number;
  activeQuestion: PublicQuestion | null;
  answerCards: { id: string; text: string }[];
  removedOptionIds: string[];
  firstWrongId: string | null;
  submittedAnswerId: string | null;
  answerCorrect: boolean | null;
  correctAnswer: string | null;
  attackSkill: { id: string; name: string; cancelled: boolean } | null;
  defenseSkill: { id: string; name: string; cancelled: boolean } | null;
  winnerId: string | null; victoryReason: string | null;
  correctCounts: Record<string, number>; defendedCounts: Record<string, number>;
  elapsedActiveMs: number; events: GameEvent[]; private?: PrivateGame;
}

export interface RoomView {
  code: string; title: string; joinLocked: boolean; practiceReuse: boolean; revision: number;
  serverTime: number; viewer: { role: 'admin' | 'team' | 'display'; teamId?: string };
  displayToken?: string;
  teams: { id: string; name: string; color: string; status: string; ready: boolean; online: boolean; lastSeen: number }[];
  matches: { id: string; round: Match['round']; teamIds: [string, string] | null; setId?: string | null; status: Match['status']; game: PublicGame | null }[];
  sets?: { id: string; title: string; reviewStatus?: string }[];
  events?: GameEvent[];
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Yêu cầu thất bại (${response.status}).`);
  return data;
}

export function useRoom(code: string, display?: string) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [serverOffset, setServerOffset] = useState(0);
  const roomRef = useRef<RoomView | null>(null);
  const [now, setNow] = useState(Date.now());
  const url = `/api/rooms/${encodeURIComponent(code)}${display ? `?display=${encodeURIComponent(display)}` : ''}`;

  const refresh = useCallback(async () => {
    try {
      const result = await parseResponse<RoomView>(await fetch(url, { cache: 'no-store' }));
      if (roomRef.current && result.revision < roomRef.current.revision) return roomRef.current;
      roomRef.current = result;
      setRoom(result);
      setServerOffset(result.serverTime - Date.now());
      setError('');
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Mất kết nối với phòng thi.');
      return null;
    }
  }, [url]);

  useEffect(() => {
    let stopped = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    // A saved team link (?team=…) restores the team cookie before polling starts.
    const team = display ? null : new URLSearchParams(window.location.search).get('team');
    const resume = team
      ? fetch(`/api/rooms/${encodeURIComponent(code)}/resume`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: team }) }).catch(() => undefined)
      : Promise.resolve();
    void resume.then(() => {
      if (stopped) return;
      void refresh();
      poll = setInterval(() => { void refresh(); }, 1200);
    });
    const clock = setInterval(() => setNow(Date.now()), 250);
    return () => { stopped = true; clearInterval(poll); clearInterval(clock); };
  }, [refresh, code, display]);

  const send = useCallback(async (command: RoomCommand) => {
    const current = roomRef.current;
    if (!current) throw new Error('Đang kết nối phòng thi.');
    setBusy(true);
    try {
      const result = await parseResponse<RoomView>(await fetch(`/api/rooms/${encodeURIComponent(code)}/command`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, commandId: crypto.randomUUID(), expectedRevision: current.revision })
      }));
      roomRef.current = result;
      setRoom(result);
      setServerOffset(result.serverTime - Date.now());
      setError('');
      return result;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Thao tác không thành công.';
      setError(message);
      void refresh();
      throw cause;
    } finally { setBusy(false); }
  }, [code, refresh]);

  const gameAction = useCallback((matchId: string, action: GameCommand) => {
    // Pin team actions to the turn/phase the player saw, so a click never lands on a later phase.
    const game = roomRef.current?.matches.find((match) => match.id === matchId)?.game;
    const expected = game && action.type !== 'pause' && action.type !== 'resume' ? { turn: game.turn, phase: game.phase } : undefined;
    return send({ type: 'game', matchId, action, expected });
  }, [send]);
  return { room, error, busy, now: now + serverOffset, refresh, send, gameAction };
}

export function phaseLabel(phase: GamePhase): string {
  return ({ question: 'Chọn câu hỏi', 'attack-skill': 'Kỹ năng công', 'defense-skill': 'Kỹ năng thủ', reaction: 'Phản đòn', answer: 'Trả lời', 'second-answer': 'Cơ hội thứ hai', reveal: 'Kết quả', reward: 'Rút kỹ năng', 'steal-cancel': 'Chặn Đánh Cắp', overflow: 'Bỏ thẻ vượt giới hạn', sudden: 'Đột tử', completed: 'Kết thúc' } as Record<GamePhase, string>)[phase];
}

export function remainingSeconds(game: PublicGame, now: number): number | null {
  if (game.paused) return game.pausedRemainingMs === null ? null : Math.max(0, Math.ceil(game.pausedRemainingMs / 1000));
  if (game.phaseDeadline === null) return null;
  return Math.max(0, Math.ceil((game.phaseDeadline - now) / 1000));
}

export function roundLabel(round: Match['round']): string {
  return round === 'semifinal-a' ? 'Bán kết A' : round === 'semifinal-b' ? 'Bán kết B' : 'Chung kết';
}

export function teamName(room: RoomView, id: string | null | undefined): string {
  return room.teams.find((team) => team.id === id)?.name ?? 'Chưa xác định';
}
