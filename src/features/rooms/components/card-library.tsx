'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { QuestionSet } from '@/features/game/types';

export function CardLibrary({ code }: { code: string }) {
  const [sets, setSets] = useState<QuestionSet[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`/api/rooms/${encodeURIComponent(code)}/sets`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json() as { sets?: QuestionSet[]; error?: string };
        if (!response.ok) throw new Error(data.error || 'Không tải được thư viện câu hỏi.');
        if (active) { setSets(data.sets ?? []); setSelected(data.sets?.[0]?.id ?? ''); }
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Không tải được thư viện câu hỏi.'); });
    return () => { active = false; };
  }, [code]);

  const set = sets.find((item) => item.id === selected);
  function download() {
    if (!set) return;
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(set, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `${set.id}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }

  return <main className="shell library-page"><header className="topbar"><Link href="/" className="brand"><span className="brand-mark">✦</span> ĐẤU TRƯỜNG TRI THỨC</Link><Link href={`/rooms/${code}`}>← Về phòng thi</Link></header>
    <div className="room-heading"><div><span className="eyebrow">ADMIN · NGÂN HÀNG CÂU HỎI</span><h1>Thư viện thẻ</h1><p>Chỉ Admin xem được nội dung câu hỏi, gợi ý và đáp án trước trận.</p></div></div>
    {error && <div className="message error" role="alert">{error} <Link href="/admin">Đăng nhập Admin</Link></div>}
    {set && <><div className="library-toolbar"><label htmlFor="library-set">Bộ câu hỏi</label><select id="library-set" value={selected} onChange={(event) => setSelected(event.target.value)}>{sets.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button className="button outline" onClick={download}>Tải JSON mẫu</button></div>
      <div className="stat-grid"><div className="stat-card"><span>TỔNG CÂU HỎI</span><strong>{set.questions.length}</strong></div><div className="stat-card"><span>ĐIỀN KHUYẾT</span><strong>{set.questions.filter((q) => q.kind === 'fill').length}</strong></div><div className="stat-card"><span>TRẮC NGHIỆM</span><strong>{set.questions.filter((q) => q.kind === 'abc').length}</strong></div><div className="stat-card"><span>THẺ ĐÁP ÁN / NHIỄU</span><strong>{set.answers.length}<small> / {set.decoys.length}</small></strong></div></div>
      <div className="library-columns"><section className="paper-panel"><div className="panel-heading"><h2>20 câu hỏi</h2><span className="muted">Mã bộ: {set.id}</span></div><div className="library-list">{set.questions.map((question, index) => <article className="library-question" key={question.id}><div><span className="eyebrow">CÂU {String(index + 1).padStart(2, '0')} · {question.kind === 'fill' ? 'ĐIỀN KHUYẾT' : 'ABC'}</span><small>{question.id}</small></div><h3>{question.text}</h3>{question.kind === 'abc' ? <div className="library-options">{Object.entries(question.options).map(([key, value]) => <span className={key === question.correctOption ? 'is-correct' : ''} key={key}>{key}. {value}</span>)}</div> : <p><strong>Đáp án:</strong> {set.answers.find((answer) => answer.id === question.answerId)?.text ?? 'Thiếu thẻ đáp án'}</p>}<p><strong>Gợi ý:</strong> {question.hint}</p></article>)}</div></section>
        <div className="library-side"><section className="paper-panel"><h2>Thẻ đáp án</h2><div className="library-card-list">{set.answers.map((answer) => <div key={answer.id}><strong>{answer.code}</strong><span>{answer.text}</span><small>{answer.id}</small></div>)}</div></section><section className="paper-panel"><h2>Thẻ nhiễu</h2><div className="library-card-list">{set.decoys.map((decoy) => <div key={decoy.id}><strong>?</strong><span>{decoy.text}</span><small>{decoy.id}</small></div>)}</div></section></div></div>
    </>}
  </main>;
}
