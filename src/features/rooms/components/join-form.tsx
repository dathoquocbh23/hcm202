'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

export function JoinForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function join(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const normalized = code.trim().toUpperCase();
      const response = await fetch(`/api/rooms/${encodeURIComponent(normalized)}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const data = await response.json() as { error?: string; code?: string };
      if (!response.ok || !data.code) throw new Error(data.error || 'Không thể vào phòng.');
      router.push(`/rooms/${data.code}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể vào phòng.'); }
    finally { setBusy(false); }
  }

  return <main className="join-page"><Link href="/" className="brand"><span className="brand-mark">✦</span> ĐẤU TRƯỜNG TRI THỨC</Link><div className="join-card"><span className="eyebrow">THAM GIA GIẢI ĐẤU</span><h1>Vào bàn học<br /><em>cùng đội bạn.</em></h1><p>Nhập mã phòng mà Admin cung cấp. Một thiết bị đại diện cho một đội.</p><form onSubmit={join} className="stack"><label className="field-label" htmlFor="join-code">Mã phòng</label><input id="join-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={6} minLength={6} required placeholder="ABC123" autoComplete="off" /><label className="field-label" htmlFor="join-name">Tên đội</label><input id="join-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={36} required placeholder="Ví dụ: Sao Mai" /><button className="button primary" disabled={busy}>{busy ? 'Đang gửi yêu cầu…' : 'Gửi yêu cầu tham gia →'}</button></form>{error && <div className="message error" role="alert">{error}</div>}<small>Sau khi Admin duyệt, đội bạn có thể báo sẵn sàng để thi đấu.</small></div></main>;
}
