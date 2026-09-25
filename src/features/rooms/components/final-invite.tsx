'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { teamName, type RoomView } from '@/features/game/client';
import type { RoomCommand } from '@/lib/server/room-store';

/** Popup on a finalist's device once the admin invites both winners to the final. */
export function FinalInvite({ room, code, send, inLobby = false }: { room: RoomView; code: string; send: (command: RoomCommand) => Promise<unknown>; inLobby?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const myId = room.viewer.role === 'team' ? room.viewer.teamId : undefined;
  const me = room.teams.find((team) => team.id === myId);
  const final = room.matches.find((match) => match.round === 'final' && match.status === 'pending' && match.invitedAt && match.teamIds?.includes(myId ?? ''));
  if (!final || !me || me.ready) return null;

  async function accept() {
    setBusy(true); setError('');
    try {
      await send({ type: 'ready', ready: true });
      if (!inLobby) router.push(`/rooms/${code}${window.location.search}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không xác nhận được. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  }

  return <div className="invite-overlay" role="dialog" aria-modal="true" aria-labelledby="final-invite-title"><div className="invite-card">
    <div className="invite-trophy" aria-hidden="true">🏆</div>
    <span className="eyebrow">LỜI MỜI TỪ ADMIN</span>
    <h2 id="final-invite-title">{me.name} vào Chung kết!</h2>
    <p>Đối thủ: <strong>{teamName(room, final.teamIds!.find((id) => id !== myId))}</strong>. Vào phòng chờ và báo sẵn sàng; màn hình thi đấu sẽ tự mở khi Admin bắt đầu.</p>
    <button className="button primary" disabled={busy} onClick={() => void accept()}>{busy ? 'Đang xác nhận…' : 'Vào phòng chờ & sẵn sàng →'}</button>
    {error && <div className="message error" role="alert">{error}</div>}
  </div></div>;
}
