'use client';

import Link from 'next/link';
import { roundLabel, teamName, type RoomView } from '@/features/game/client';
import type { RoomCommand } from '@/lib/server/room-store';

type MatchView = RoomView['matches'][number];

interface Props {
  room: RoomView;
  code: string;
  busy: boolean;
  run: (command: RoomCommand) => Promise<void>;
  startable: (matchId: string) => boolean;
}

function statusLabel(match: MatchView): string {
  if (match.status === 'completed') return 'Đã xong';
  if (match.status === 'active') return 'Đang diễn ra';
  if (match.round === 'final') return !match.teamIds ? 'Chờ bán kết' : match.invitedAt ? 'Đã mời' : 'Chờ mời';
  return 'Chưa bắt đầu';
}

function MatchCard({ room, code, busy, run, startable, match }: Props & { match: MatchView }) {
  const final = match.round === 'final';
  const winnerId = match.status === 'completed' ? match.game?.winnerId : null;
  // Ready only matters for the final once the invitation is out.
  const showReady = match.status === 'pending' && Boolean(match.teamIds) && (!final || Boolean(match.invitedAt));
  const allReady = match.teamIds?.every((id) => room.teams.find((team) => team.id === id)?.ready) ?? false;
  const placeholder = (index: number) => final ? `Thắng ${roundLabel(index === 0 ? 'semifinal-a' : 'semifinal-b')}` : 'Chưa bốc thăm';

  return <article className={`ko-match ${match.status} ${final ? 'is-final' : ''}`}>
    <header><span className="eyebrow">{roundLabel(match.round)}</span><span className={`ko-status ${match.status}`}>{statusLabel(match)}</span></header>
    <div className="ko-slots">{[0, 1].map((index) => {
      const id = match.teamIds?.[index];
      const team = room.teams.find((item) => item.id === id);
      return <div key={index} className={`ko-slot ${!id ? 'empty' : ''} ${winnerId ? id === winnerId ? 'winner' : 'loser' : ''}`}>
        {team && <span className={`team-dot ${team.color}`} />}
        <strong>{id ? teamName(room, id) : placeholder(index)}</strong>
        {match.status !== 'pending' && id && match.game && <small>{match.game.hp[id]} HP</small>}
        {showReady && team && <small className={team.ready ? 'ko-ready' : 'ko-waiting'}>{team.ready ? '● Sẵn sàng' : '○ Chưa sẵn sàng'}</small>}
      </div>;
    })}</div>
    {match.status === 'pending' && <div className="ko-actions">
      <select aria-label={`Bộ câu hỏi ${roundLabel(match.round)}`} value={match.setId ?? ''} disabled={busy} onChange={(event) => void run({ type: 'assign-set', matchId: match.id, setId: event.target.value })}><option value="">Chọn bộ câu hỏi</option>{room.sets?.map((set) => <option key={set.id} value={set.id}>{set.title}</option>)}</select>
      {final && !match.teamIds && <small>Chờ hai trận bán kết kết thúc.</small>}
      {final && match.teamIds && !match.invitedAt && <><button className="button small primary" disabled={busy} onClick={() => void run({ type: 'invite-final', matchId: match.id })}>🏆 Mời 2 đội vào chung kết</button><small>Màn hình hai đội thắng sẽ hiện lời mời vào phòng chờ.</small></>}
      {(!final || match.invitedAt) && match.teamIds && <><button className="button small primary" disabled={busy || !startable(match.id)} onClick={() => void run({ type: 'start-match', matchId: match.id })}>▶ Bắt đầu {final ? 'chung kết' : 'trận'}</button>{!match.setId ? <small>Cần gán bộ câu hỏi.</small> : !allReady && <small>{final ? 'Đã gửi lời mời · chờ hai đội bấm sẵn sàng.' : 'Chờ cả hai đội báo sẵn sàng.'}</small>}</>}
    </div>}
    {match.status === 'active' && <Link className="text-button" href={`/rooms/${code}/watch/${match.id}`}>Theo dõi trận →</Link>}
    {match.status === 'completed' && <Link className="text-button" href={`/rooms/${code}/match/${match.id}/result`}>Kết quả →</Link>}
  </article>;
}

/** Admin knockout tree: two semifinals feed the final, which the admin opens with an invitation. */
export function KnockoutBracket(props: Props) {
  const { room } = props;
  const semis = room.matches.filter((match) => match.round !== 'final');
  const final = room.matches.find((match) => match.round === 'final');
  const champion = final?.status === 'completed' ? final.game?.winnerId : null;
  return <div className="ko-bracket">
    <div className="ko-semis">{semis.map((match) => <MatchCard key={match.id} {...props} match={match} />)}</div>
    <div className="ko-connector" aria-hidden="true" />
    <div className="ko-final">{final && <MatchCard {...props} match={final} />}</div>
    <div className={`ko-champion ${champion ? 'crowned' : ''}`}><span>🏆</span><small>NHÀ VÔ ĐỊCH</small><strong>{champion ? teamName(room, champion) : 'Chưa xác định'}</strong></div>
  </div>;
}
