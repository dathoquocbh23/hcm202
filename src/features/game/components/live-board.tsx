'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { roundLabel, teamName, useRoom, type RoomView } from '../client';
import { DeskOverview } from './desk-overview';

type LiveMatch = RoomView['matches'][number];

function Pane({ room, match, now, solo }: { room: RoomView; match: LiveMatch; now: number; solo: boolean }) {
  const [a, b] = match.teamIds ?? [null, null];
  const colorOf = (id: string | null) => room.teams.find((team) => team.id === id)?.color ?? 'green';
  const game = match.game;
  return <section className={`live-pane status-${match.status}`} aria-label={roundLabel(match.round)}>
    <header className="live-pane-head">
      <span className="live-round">{roundLabel(match.round).toUpperCase()}</span>
      <span className="live-versus"><i className={`team-dot ${colorOf(a)}`} />{teamName(room, a)}<small>vs</small><i className={`team-dot ${colorOf(b)}`} />{teamName(room, b)}</span>
      <span className={`live-state ${match.status}`}>{match.status === 'active' ? (game?.paused ? '❚❚ TẠM DỪNG' : '● TRỰC TIẾP') : match.status === 'completed' ? 'ĐÃ KẾT THÚC' : 'SẮP DIỄN RA'}</span>
    </header>
    {game && match.teamIds
      ? <div className="live-pane-body"><DeskOverview room={room} game={game} teamIds={match.teamIds} ownId={null} spectator now={now} compact={!solo} />
        {match.status === 'completed' && <div className="live-winner"><span>🏆</span><small>CHIẾN THẮNG</small><strong>{teamName(room, game.winnerId)}</strong><em>{game.hp[match.teamIds[0]]} HP — {game.hp[match.teamIds[1]]} HP · {game.turn} lượt</em></div>}</div>
      : <div className="live-waiting"><span className="live-waiting-mark">✦</span><strong>{match.teamIds ? `${teamName(room, a)} vs ${teamName(room, b)}` : 'Chờ hai đội thắng bán kết'}</strong><small>Trận sẽ tự hiện ở đây khi Admin bắt đầu.</small></div>}
  </section>;
}

/** Read-only spectator wall: both semifinals side by side, then the final alone. */
export function LiveBoard({ code, display }: { code: string; display?: string }) {
  const { room, error, now } = useRoom(code, display);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  if (!room) return <main className="live-page"><div className="live-empty"><h1>{error ? 'Chưa mở được màn hình trực tiếp' : 'Đang kết nối…'}</h1><p>{error || 'Đang tải bàn đấu.'}</p>{error && <p className="muted">Liên kết khán giả cần có tham số <code>display</code> do Admin cung cấp.</p>}</div></main>;

  const final = room.matches.find((match) => match.round === 'final');
  const semis = room.matches.filter((match) => match.round !== 'final');
  const panes = final && final.status !== 'pending' ? [final] : semis;
  const clock = new Date(now).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  return <main className={`live-page ${panes.length === 1 ? 'solo' : 'split'}`}>
    <header className="live-topbar">
      <span className="brand"><span className="brand-mark">✦</span> ĐẤU TRƯỜNG TRI THỨC</span>
      <span className="live-title">{room.title}</span>
      <span className="live-top-right">{error && <span className="live-offline">Mất kết nối · đang thử lại</span>}<span className="live-clock">{clock}</span>{!fullscreen && <button type="button" className="button small outline" onClick={() => void document.documentElement.requestFullscreen?.()}>Toàn màn hình</button>}</span>
    </header>
    {panes.length
      ? <div className="live-grid">{panes.map((match) => <Pane key={match.id} room={room} match={match} now={now} solo={panes.length === 1} />)}</div>
      : <div className="live-empty"><span className="live-waiting-mark">✦</span><h1>Giải đấu sắp bắt đầu</h1><p>Các trận sẽ hiện ở đây sau khi Admin bốc thăm và bắt đầu trận.</p></div>}
    {!display && room.viewer.role === 'admin' && <Link className="live-back" href={`/rooms/${code}`}>← Về phòng thi</Link>}
  </main>;
}
