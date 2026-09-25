'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { phaseLabel, remainingSeconds, roundLabel, teamName, useRoom, type RoomView } from '@/features/game/client';
import type { RoomCommand } from '@/lib/server/room-store';

function matchStatus(room: RoomView, teamId: string): string {
  const own = room.matches.find((match) => match.teamIds?.includes(teamId) && match.status === 'active');
  if (own) return own.game?.attackerId === teamId ? 'Đang tấn công' : 'Đang phòng thủ';
  if (room.matches.find((match) => match.round === 'final' && match.status === 'completed')?.game?.winnerId === teamId) return 'Vô địch';
  if (room.matches.some((match) => match.status === 'completed' && match.teamIds?.includes(teamId) && match.game?.winnerId !== teamId)) return 'Đã bị loại';
  if (room.matches.find((match) => match.round === 'final' && match.teamIds?.includes(teamId))) return 'Vào chung kết';
  return 'Chờ trận';
}

export function RoomDashboard({ code }: { code: string }) {
  const router = useRouter();
  const { room, error, busy, now, send } = useRoom(code);
  const [feedback, setFeedback] = useState('');
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [copied, setCopied] = useState(false);
  const myId = room?.viewer.role === 'team' ? room.viewer.teamId : undefined;
  const myActiveMatch = room?.matches.find((match) => match.status === 'active' && match.teamIds?.includes(myId ?? ''));

  useEffect(() => {
    if (myId && myActiveMatch) router.push(`/rooms/${code}/match/${myActiveMatch.id}${window.location.search}`);
  }, [myId, myActiveMatch?.id, code, router]);

  async function run(command: RoomCommand) {
    setFeedback('');
    try { await send(command); }
    catch (cause) { setFeedback(cause instanceof Error ? cause.message : 'Thao tác thất bại.'); }
  }

  async function copyJoin() {
    try { await navigator.clipboard.writeText(`${location.origin}/join?code=${code}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setFeedback(`Mã phòng: ${code}`); }
  }

  async function copyDisplay(matchId?: string) {
    if (!room?.displayToken) return;
    const path = matchId ? `watch/${matchId}` : 'live';
    try {
      await navigator.clipboard.writeText(`${location.origin}/rooms/${code}/${path}?display=${room.displayToken}`);
      setFeedback(matchId ? 'Đã sao chép liên kết trình chiếu công khai của trận này.' : 'Đã sao chép liên kết khán giả. Ai có liên kết đều xem được cả hai bàn đấu, không thao tác được.');
    } catch { setFeedback('Không sao chép được liên kết trình chiếu.'); }
  }

  function startable(matchId: string): boolean {
    const match = room?.matches.find((item) => item.id === matchId);
    if (!room || !match || match.status !== 'pending' || !match.teamIds || !match.setId) return false;
    if (!match.teamIds.every((id) => room.teams.find((team) => team.id === id)?.ready)) return false;
    if (match.round === 'final' && room.matches.some((item) => item.round !== 'final' && item.status !== 'completed')) return false;
    return !room.matches.some((item) => item.status === 'active' && item.teamIds?.some((id) => match.teamIds!.includes(id)));
  }

  async function startMatches(matchIds: string[]) {
    setFeedback('');
    try { for (const matchId of matchIds) await send({ type: 'start-match', matchId }); }
    catch (cause) { setFeedback(cause instanceof Error ? cause.message : 'Không bắt đầu được trận.'); }
  }

  async function importSet() {
    setFeedback('');
    try {
      await send({ type: 'import-set', value: JSON.parse(importText) });
      setImportText('');
      setShowImport(false);
    } catch (cause) {
      setFeedback(cause instanceof SyntaxError ? 'Tệp JSON chưa đúng định dạng.' : cause instanceof Error ? cause.message : 'Không nhập được bộ câu hỏi.');
    }
  }

  if (!room) return <main className="shell"><header className="topbar"><Link href="/" className="brand"><span className="brand-mark">✦</span> ĐẤU TRƯỜNG TRI THỨC</Link></header><div className="paper-panel"><p>{error || 'Đang kết nối phòng thi…'}</p><Link href="/" className="button outline">Về trang chủ</Link></div></main>;
  const admin = room.viewer.role === 'admin';
  const approved = room.teams.filter((team) => team.status === 'approved');
  const pending = room.teams.filter((team) => team.status === 'pending');
  const activeMatches = room.matches.filter((match) => match.status === 'active' && match.game);
  const semis = room.matches.filter((match) => match.round !== 'final');
  const bothSemisReady = semis.length === 2 && semis.every((match) => startable(match.id));
  const liveHref = room.displayToken ? `/rooms/${code}/live?display=${room.displayToken}` : null;
  const completed = room.matches.filter((match) => match.status === 'completed').length;
  const me = room.teams.find((team) => team.id === myId);
  const myUpcoming = room.matches.find((match) => match.status === 'pending' && match.teamIds?.includes(myId ?? ''));
  const lastEvents = [...(room.events ?? []), ...room.matches.flatMap((match) => match.game?.events ?? [])].sort((a, b) => b.at - a.at).slice(0, 9);

  return <main className="shell room-page"><header className="topbar"><Link href="/" className="brand"><span className="brand-mark">✦</span> ĐẤU TRƯỜNG TRI THỨC</Link><div className="topbar-links"><Link href="/rules">Luật chơi</Link>{admin && <Link href="/admin">Các phòng của tôi</Link>}</div></header>
    <div className="room-heading"><div><span className="eyebrow">{admin ? 'ADMIN · PHÒNG THI' : 'PHÒNG CHỜ ĐỘI THI'}</span><h1>{room.title}</h1><p>Mã phòng <strong className="code-label">{room.code}</strong> <span className="live-indicator">● Đồng bộ trực tiếp</span></p></div>{admin && <button className="button outline" onClick={copyJoin}>{copied ? 'Đã sao chép' : 'Sao chép liên kết tham gia'}</button>}</div>
    {(error || feedback) && <div className="message error" role="alert">{feedback || error}</div>}
    {admin ? <><div className="stat-grid"><div className="stat-card"><span>ĐỘI ĐÃ DUYỆT</span><strong>{approved.length}<small>/4</small></strong></div><div className="stat-card"><span>ĐỘI TRỰC TUYẾN</span><strong>{approved.filter((team) => team.online).length}<small>/{approved.length}</small></strong></div><div className="stat-card"><span>ĐỘI SẴN SÀNG</span><strong>{approved.filter((team) => team.ready).length}<small>/{approved.length}</small></strong></div><div className="stat-card"><span>TRẬN HOÀN THÀNH</span><strong>{completed}<small>/3</small></strong></div></div>
      <div className="room-columns"><section className="paper-panel"><div className="panel-heading"><h2>Các đội tham gia</h2><span className="muted">{approved.length} / 4 đội</span></div>{approved.length ? <div className="team-list">{approved.map((team) => { const ownMatch = room.matches.find((match) => match.status === 'active' && match.teamIds?.includes(team.id)); const hp = ownMatch?.game?.hp[team.id]; return <div className="team-row" key={team.id}><span className={`team-dot ${team.color}`} /><span className="team-row-name"><strong>{team.name}</strong><small>{team.online ? '● Trực tuyến' : '○ Mất kết nối'} · {team.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</small></span><span className="muted">{matchStatus(room, team.id)}</span><strong className="hp-label">{hp !== undefined ? `${hp} HP` : '—'}</strong></div>; })}</div> : <p className="empty-state">Chưa có đội được duyệt. Gửi mã phòng cho các đội để bắt đầu.</p>}{pending.length > 0 && <div className="pending-list"><h3>Yêu cầu chờ duyệt · {pending.length}</h3>{pending.map((team) => <div className="pending-row" key={team.id}><span>{team.name}</span><div><button disabled={busy} onClick={() => run({ type: 'approve', teamId: team.id })}>Duyệt</button><button disabled={busy} onClick={() => run({ type: 'reject', teamId: team.id })}>Từ chối</button></div></div>)}</div>}{!room.matches.length && <div className="panel-footer"><button className="button primary" disabled={busy || approved.length !== 4} onClick={() => run({ type: 'create-bracket' })}>Bốc thăm chia bảng</button>{approved.length !== 4 && <small>Cần duyệt đủ bốn đội.</small>}</div>}</section>
        <section className="paper-panel"><div className="panel-heading"><h2>Trận đang diễn ra</h2>{activeMatches.length > 0 && <span className="status-pill">{activeMatches.length} trận đang thi đấu</span>}</div>
          {liveHref && room.matches.length > 0 && <div className="spectator-link"><div><strong>Liên kết khán giả · 2 màn hình</strong><small>Xem song song hai bàn đấu, tự chuyển sang chung kết. Dùng để chiếu hoặc stream (OBS), không thao tác được.</small></div><div><Link className="button small primary" href={liveHref} target="_blank">Mở màn hình trực tiếp ↗</Link><button className="button small outline" onClick={() => void copyDisplay()}>Sao chép liên kết</button></div></div>}
          {activeMatches.length ? <div className="live-match-list">{activeMatches.map((match) => { const game = match.game!; const clock = remainingSeconds(game, now); return <div className="live-match-card" key={match.id}><span className="eyebrow">{roundLabel(match.round)} · LƯỢT {game.turn}</span><h3>{teamName(room, match.teamIds?.[0])} <small>vs</small> {teamName(room, match.teamIds?.[1])}</h3><div className="score-line"><strong>{game.hp[match.teamIds![0]]} HP</strong><span>—</span><strong>{game.hp[match.teamIds![1]]} HP</strong></div><p>{phaseLabel(game.phase)}{clock !== null ? ` · ${clock} giây` : ''}{game.paused ? ' · Đã tạm dừng' : ''}</p><div className="live-match-actions"><Link className="button small primary" href={`/rooms/${code}/watch/${match.id}`}>Xem trực tiếp →</Link><button className="button small outline" onClick={() => void copyDisplay(match.id)}>Liên kết trận này</button><button className="button small outline" disabled={busy} onClick={() => run({ type: 'game', matchId: match.id, action: { type: game.paused ? 'resume' : 'pause' } })}>{game.paused ? 'Tiếp tục' : 'Tạm dừng'}</button></div></div>; })}</div> : <p className="empty-state">Chưa có trận nào đang diễn ra.</p>}</section></div>
      <div className="room-columns"><section className="paper-panel"><div className="panel-heading"><h2>Sơ đồ giải đấu</h2><Link href={`/rooms/${code}/cards`} className="text-button">Bộ câu hỏi →</Link></div>{!room.matches.length ? <p className="empty-state">Bốc thăm sau khi duyệt đủ bốn đội.</p> : <>{semis.some((match) => match.status === 'pending') && semis.length === 2 && <div className="start-both"><button className="button primary" disabled={busy || !bothSemisReady} onClick={() => void startMatches(semis.map((match) => match.id))}>▶ Bắt đầu cả hai bán kết cùng lúc</button><small>{bothSemisReady ? 'Hai trận chạy song song trên hai bàn riêng.' : 'Cần gán bộ câu hỏi và cả bốn đội báo sẵn sàng.'}</small></div>}<div className="bracket-list">{room.matches.map((match) => <div className="bracket-row" key={match.id}><span className="eyebrow">{roundLabel(match.round)}</span><strong>{match.teamIds ? `${teamName(room, match.teamIds[0])} vs ${teamName(room, match.teamIds[1])}` : 'Chờ kết quả bán kết'}</strong><small>{match.status === 'completed' ? `Thắng: ${teamName(room, match.game?.winnerId)}` : match.status === 'active' ? 'Đang diễn ra' : 'Chưa bắt đầu'}</small>{match.status === 'completed' && <Link className="text-button" href={`/rooms/${code}/match/${match.id}/result`}>Kết quả →</Link>}{match.status === 'pending' && <><select aria-label={`Bộ câu hỏi ${roundLabel(match.round)}`} value={match.setId ?? ''} disabled={busy} onChange={(event) => run({ type: 'assign-set', matchId: match.id, setId: event.target.value })}><option value="">Chọn bộ câu hỏi</option>{room.sets?.map((set) => <option key={set.id} value={set.id}>{set.title}</option>)}</select><button className="button small primary" disabled={busy || !startable(match.id)} onClick={() => run({ type: 'start-match', matchId: match.id })}>Bắt đầu trận</button>{!match.setId && <small>Cần gán bộ câu hỏi.</small>}{match.teamIds && !match.teamIds.every((id) => room.teams.find((team) => team.id === id)?.ready) && <small>Chờ cả hai đội báo sẵn sàng.</small>}</>}</div>)}</div></>}</section><section className="paper-panel"><h2>Hoạt động gần đây</h2>{lastEvents.length ? <div className="event-list">{lastEvents.map((event) => <div key={event.id}><time>{new Date(event.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</time><span>{event.text}</span></div>)}</div> : <p className="empty-state">Hoạt động sẽ xuất hiện khi các đội tham gia.</p>}<div className="panel-footer"><button className="text-button" disabled={busy} onClick={() => run({ type: 'lock-joins', locked: !room.joinLocked })}>{room.joinLocked ? 'Đã khóa nhận đội mới' : 'Khóa nhận đội mới'}</button></div></section></div>
      <section className="paper-panel import-panel"><div className="panel-heading"><div><h2>Bộ câu hỏi</h2><p>Mẫu có 20 câu, đủ cho một trận. {room.practiceReuse ? 'Chế độ thử đang cho phép dùng lại bộ mẫu.' : 'Nhập thêm bộ câu hỏi cho các trận còn lại.'}</p></div><button className="button outline" onClick={() => setShowImport(!showImport)}>{showImport ? 'Đóng' : 'Nhập JSON'}</button></div>{showImport && <div className="stack"><label className="field-label" htmlFor="set-json">Nội dung bộ câu hỏi JSON</label><textarea id="set-json" rows={8} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Dán bộ câu hỏi theo cấu trúc mẫu…" /><button className="button primary" disabled={busy || !importText.trim()} onClick={() => void importSet()}>Kiểm tra và nhập bộ câu hỏi</button></div>}</section>
    </> : <section className="team-lobby"><div className="paper-panel team-welcome"><span className={`team-avatar ${me?.color ?? 'blue'}`}>✦</span><span className="eyebrow">ĐỘI CỦA BẠN</span><h2>{me?.name ?? 'Đội thi'}</h2><p>{me?.status === 'pending' ? 'Đang chờ Admin duyệt yêu cầu tham gia.' : me?.status === 'approved' ? myUpcoming ? `${roundLabel(myUpcoming.round)} · Đối thủ: ${teamName(room, myUpcoming.teamIds?.find((id) => id !== myId))}` : 'Chờ bốc thăm hoặc kết quả trận trước.' : 'Yêu cầu tham gia chưa được duyệt.'}</p>{me?.status === 'approved' && !myActiveMatch && <button className={`button ${me.ready ? 'outline' : 'primary'}`} disabled={busy} onClick={() => run({ type: 'ready', ready: !me.ready })}>{me.ready ? 'Đã sẵn sàng · Bấm để đổi' : 'Đội tôi đã sẵn sàng'}</button>}{myActiveMatch && <Link className="button primary" href={`/rooms/${code}/match/${myActiveMatch.id}`}>Vào bàn thi đấu →</Link>}</div><div className="paper-panel"><h2>Tình hình giải đấu</h2><div className="lobby-teams">{approved.map((team) => <div key={team.id}><span className={`team-dot ${team.color}`} /><strong>{team.name}</strong><small>{team.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</small></div>)}</div><p className="muted">Sau khi Admin bắt đầu trận, màn hình thi đấu sẽ tự mở trên thiết bị đội bạn.</p></div></section>}
  </main>;
}
