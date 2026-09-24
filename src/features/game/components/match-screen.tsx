'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { roundLabel, teamName, useRoom, type RoomView } from '../client';
import type { GameCommand } from '../types';
import { DeskOverview } from './desk-overview';
import { FocusOverlay } from './focus-overlay';

export function MatchScreen({ code, matchId, display, spectator = false }: { code: string; matchId: string; display?: string; spectator?: boolean }) {
  const { room, error, busy, now, gameAction } = useRoom(code, display);
  const [minimized, setMinimized] = useState(false);
  const [holdUntil, setHoldUntil] = useState(0);
  const match = room?.matches.find((item) => item.id === matchId);
  const game = match?.game;
  const ownId = !spectator && room?.viewer.role === 'team' ? room.viewer.teamId ?? null : null;

  useEffect(() => { setMinimized(false); }, [game?.phase]);

  async function act(action: GameCommand) {
    try {
      const updated = await gameAction(matchId, action);
      const next = updated.matches.find((item) => item.id === matchId)?.game;
      if (next?.phase !== 'second-answer') setHoldUntil(Date.now() + 850);
    } catch { /* useRoom displays the server's error and refreshes current state */ }
  }

  if (!room || !match || !game) return <main className="shell"><header className="topbar"><Link href="/" className="brand"><span className="brand-mark">✦</span> ĐẤU TRƯỜNG TRI THỨC</Link></header><div className="paper-panel"><h1>{error ? 'Chưa mở được trận' : 'Đang vào bàn học…'}</h1><p>{error || 'Đang đồng bộ trạng thái trận đấu.'}</p><Link href={`/rooms/${code}`} className="button outline">Về phòng thi</Link></div></main>;
  const teamIds = match.teamIds!;
  const canFocus = Boolean(ownId && game.private?.canAct && !game.paused && game.phase !== 'completed');
  const showFocus = canFocus && !minimized && Date.now() >= holdUntil;
  const matchLabel = `${teamName(room, teamIds[0])} vs ${teamName(room, teamIds[1])}`;

  return <main className={`match-page ${spectator ? 'spectator-mode' : ''}`}><header className="match-topbar"><div><Link href={room.viewer.role === 'display' ? '/' : `/rooms/${code}`} className="back-link">← {room.viewer.role === 'admin' ? 'Tổng quan phòng' : room.viewer.role === 'display' ? 'Trang chủ' : 'Phòng chờ'}</Link><span className="match-breadcrumb">{roundLabel(match.round)} · {matchLabel}</span></div><div className="match-top-actions"><span className="live-indicator">● {error ? 'Mất kết nối' : 'Đang đồng bộ'}</span>{room.viewer.role === 'admin' && spectator && !display && game.phase !== 'completed' && <button className="button small outline" disabled={busy} onClick={() => void act({ type: game.paused ? 'resume' : 'pause' })}>{game.paused ? 'Tiếp tục' : 'Tạm dừng'}</button>}<Link href="/rules" className="button small outline">Luật chơi</Link></div></header>
    {error && <div className="message error match-error" role="alert">{error} · Đang thử đồng bộ lại.</div>}
    {game.paused && <div className="message warning match-error">Admin đã tạm dừng trận. Đồng hồ sẽ tiếp tục khi trận được mở lại.</div>}
    <div aria-hidden={showFocus}><DeskOverview room={room} game={game} teamIds={teamIds} ownId={ownId} spectator={spectator || room.viewer.role !== 'team'} fxFixed={Boolean(ownId)} now={now} onContinue={canFocus && !showFocus ? () => { setMinimized(false); setHoldUntil(0); } : undefined} /></div>
    {showFocus && ownId && <FocusOverlay room={room} game={game} teamId={ownId} now={now} busy={busy} onAction={act} onMinimize={() => setMinimized(true)} />}
    {game.phase === 'completed' && <div className="match-result-banner"><div><span className="eyebrow">KẾT QUẢ TRẬN ĐẤU</span><h2>🏆 {teamName(room, game.winnerId)} chiến thắng</h2><p>{teamName(room, teamIds[0])} {game.hp[teamIds[0]]} HP — {game.hp[teamIds[1]]} HP {teamName(room, teamIds[1])} · {game.turn} lượt</p></div><Link href={`/rooms/${code}/match/${matchId}/result${display ? `?display=${encodeURIComponent(display)}` : ''}`} className="button primary">Xem kết quả chi tiết</Link></div>}
    {!showFocus && <div className="match-events"><strong>Diễn biến gần đây</strong><div>{[...game.events].reverse().slice(0, 4).map((event) => <span key={event.id}>{event.text}</span>)}</div></div>}
  </main>;
}
