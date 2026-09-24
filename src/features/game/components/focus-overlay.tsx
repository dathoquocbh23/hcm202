'use client';

import { teamName, type PublicGame, type RoomView } from '../client';
import type { GameCommand } from '../types';
import { ActionFocus } from './action-focus';

export function FocusOverlay({ room, game, teamId, now, busy, onAction, onMinimize, demo = false }: {
  room: RoomView; game: PublicGame; teamId: string; now: number; busy: boolean;
  onAction: (action: GameCommand) => Promise<void>; onMinimize: () => void; demo?: boolean;
}) {
  return <div className="focus-overlay" role="dialog" aria-modal="true" aria-label={`Bảng thao tác của ${teamName(room, teamId)}`}>
    <button type="button" className="focus-overlay-backdrop" aria-label="Thu gọn bảng chọn để xem bàn học" onClick={onMinimize} />
    <div className="focus-overlay-sheet"><div className="focus-overlay-bar"><span>✦ BÀN HỌC VẪN ĐANG DIỄN RA</span><button type="button" className="text-button" onClick={onMinimize}>Xem toàn bàn ↗</button></div><ActionFocus room={room} game={game} teamId={teamId} now={now} busy={busy} onAction={onAction} onMinimize={onMinimize} demo={demo} /></div>
  </div>;
}
