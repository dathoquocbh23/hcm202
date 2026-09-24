'use client';

import Link from 'next/link';
import { roundLabel, teamName, useRoom } from '../client';

export function MatchResult({ code, matchId, display }: { code: string; matchId: string; display?: string }) {
  const { room, error } = useRoom(code, display);
  const match = room?.matches.find((item) => item.id === matchId);
  const game = match?.game;
  if (!room || !match || !game) return <main className="shell"><div className="paper-panel"><p>{error || 'Đang tải kết quả trận…'}</p><Link href={`/rooms/${code}`}>Về phòng thi</Link></div></main>;
  if (game.phase !== 'completed') return <main className="shell"><div className="paper-panel"><p>Trận vẫn đang diễn ra.</p><Link className="button primary" href={`/rooms/${code}/${room.viewer.role === 'admin' || display ? 'watch' : 'match'}/${matchId}${display ? `?display=${encodeURIComponent(display)}` : ''}`}>Xem trận đấu</Link></div></main>;
  const ids = match.teamIds!;
  const reason = game.victoryReason === 'knockout' ? 'Hạ gục đối thủ' : game.victoryReason === 'sudden' ? 'Thắng ở lượt đột tử' : 'Dẫn trước khi hết giới hạn';
  return <main className="shell result-page"><header className="topbar"><Link href="/" className="brand"><span className="brand-mark">✦</span> ĐẤU TRƯỜNG TRI THỨC</Link><Link href={display ? `/rooms/${code}/watch/${matchId}?display=${encodeURIComponent(display)}` : `/rooms/${code}`}>← {display ? 'Về bàn đấu' : 'Về sơ đồ giải đấu'}</Link></header>
    <div className="result-hero"><span className="eyebrow">{roundLabel(match.round)} · KẾT QUẢ CHÍNH THỨC</span><div className="result-medal">✦</div><h1>{teamName(room, game.winnerId)} chiến thắng</h1><p>{reason} sau {game.turn} lượt thi đấu.</p></div>
    <div className="result-score">{ids.map((id, index) => <div className={id === game.winnerId ? 'is-winner' : ''} key={id}><span className="eyebrow">ĐỘI {index + 1}</span><h2>{teamName(room, id)}</h2><strong>{game.hp[id]} <small>HP</small></strong><span>{game.correctCounts[id]} câu trả lời đúng · {game.defendedCounts[id]} lượt phòng thủ</span></div>)}</div>
    <section className="paper-panel"><div className="panel-heading"><h2>Nhật ký trận đấu</h2><span className="muted">{Math.round(game.elapsedActiveMs / 1000)} giây thi đấu thực tế</span></div><div className="result-log">{game.events.map((event) => <div key={event.id}><time>{new Date(event.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><span>{event.turn ? `Lượt ${event.turn}` : 'Mở trận'}</span><p>{event.text}</p></div>)}</div></section>
  </main>;
}
