'use client';

import Link from 'next/link';
import { roundLabel, teamName, useFollowActiveMatch, useRoom, type AnswerReview, type RoomView } from '../client';
import { QuestionText } from './game-cards';
import { FinalInvite } from '@/features/rooms/components/final-invite';

const OUTCOME = { correct: 'Đúng', wrong: 'Sai', timeout: 'Hết giờ' } as const;

function ReviewItem({ room, item }: { room: RoomView; item: AnswerReview }) {
  const picked = item.submitted?.[0];
  return <article className={`review-item ${item.outcome}`}>
    <div className="review-meta"><span className="eyebrow">LƯỢT {item.turn}{item.sudden ? ' · ĐỘT TỬ' : ''} · {item.questionId} · {item.kind === 'abc' ? 'TRẮC NGHIỆM' : 'ĐIỀN KHUYẾT'}</span><span className={`review-badge ${item.outcome}`}>{OUTCOME[item.outcome]}{item.damage > 0 ? ` · −${item.damage} HP` : ''}</span></div>
    <small className="review-team">{teamName(room, item.teamId)} trả lời</small>
    <h3><QuestionText text={item.text} /></h3>
    {item.kind === 'abc' && item.options
      ? <div className="library-options">{(['A', 'B', 'C'] as const).map((key) => <span key={key} className={`${item.correctAnswer?.[0] === key ? 'is-correct' : ''} ${item.known && picked === key && item.outcome === 'wrong' ? 'is-wrong' : ''}`}>{key}. {item.options![key]}{item.known && picked === key ? ' · đội chọn' : ''}</span>)}</div>
      : <p className="review-answers">{item.known && <span className={item.outcome === 'correct' ? 'is-correct' : 'is-wrong'}><strong>Đội chọn:</strong> {item.submitted ?? 'Không chọn (hết giờ)'}</span>}<span className="is-correct"><strong>Đáp án đúng:</strong> {item.correctAnswer}</span></p>}
    {item.kind === 'abc' && item.known && !item.submitted && <p className="review-answers"><span className="is-wrong">Không chọn (hết giờ)</span></p>}
    {item.skills.length > 0 && <small className="review-skills">Kỹ năng: {item.skills.map((skill) => `${skill.name}${skill.cancelled ? ' (bị Vô Hiệu)' : ''}`).join(' · ')}</small>}
  </article>;
}

export function MatchResult({ code, matchId, display }: { code: string; matchId: string; display?: string }) {
  const { room, error, send } = useRoom(code, display);
  useFollowActiveMatch(room, code, matchId);
  const match = room?.matches.find((item) => item.id === matchId);
  const game = match?.game;
  if (!room || !match || !game) return <main className="shell"><div className="paper-panel"><p>{error || 'Đang tải kết quả trận…'}</p><Link href={`/rooms/${code}`}>Về phòng thi</Link></div></main>;
  if (game.phase !== 'completed') return <main className="shell"><div className="paper-panel"><p>Trận vẫn đang diễn ra.</p><Link className="button primary" href={`/rooms/${code}/${room.viewer.role === 'admin' || display ? 'watch' : 'match'}/${matchId}${display ? `?display=${encodeURIComponent(display)}` : ''}`}>Xem trận đấu</Link></div></main>;
  const ids = match.teamIds!;
  const review = game.review ?? [];
  const reason = game.victoryReason === 'knockout' ? 'Hạ gục đối thủ' : game.victoryReason === 'sudden' ? 'Thắng ở lượt đột tử' : 'Dẫn trước khi hết giới hạn';
  return <main className="shell result-page"><header className="topbar"><Link href="/" className="brand"><span className="brand-mark">✦</span> ĐẤU TRƯỜNG TRI THỨC</Link><Link href={display ? `/rooms/${code}/watch/${matchId}?display=${encodeURIComponent(display)}` : `/rooms/${code}`}>← {display ? 'Về bàn đấu' : 'Về sơ đồ giải đấu'}</Link></header>
    <div className="result-hero"><span className="eyebrow">{roundLabel(match.round)} · KẾT QUẢ CHÍNH THỨC</span><div className="result-medal">✦</div><h1>{teamName(room, game.winnerId)} chiến thắng</h1><p>{reason} sau {game.turn} lượt thi đấu.</p></div>
    <div className="result-score">{ids.map((id, index) => <div className={id === game.winnerId ? 'is-winner' : ''} key={id}><span className="eyebrow">ĐỘI {index + 1}</span><h2>{teamName(room, id)}</h2><strong>{game.hp[id]} <small>HP</small></strong><span>{game.correctCounts[id]} câu trả lời đúng · {game.defendedCounts[id]} lượt phòng thủ</span></div>)}</div>
    <section className="paper-panel"><div className="panel-heading"><h2>Câu hỏi đã trả lời</h2><span className="muted">{review.length} câu · {Math.round(game.elapsedActiveMs / 1000)} giây thi đấu thực tế</span></div>
      {review.length && !review[0].known ? <p className="muted">Trận này diễn ra trước khi hệ thống lưu đáp án từng đội chọn, nên chỉ hiện kết quả và đáp án đúng.</p> : null}
      {review.length ? <div className="review-list">{review.map((item, index) => <ReviewItem key={index} room={room} item={item} />)}</div> : <p className="empty-state">Chưa có câu hỏi nào được trả lời.</p>}</section>
    <FinalInvite room={room} code={code} send={send} />
  </main>;
}
