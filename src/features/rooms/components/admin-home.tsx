'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';

interface RoomItem { code: string; title: string; createdAt: number; approved: number; active: boolean }

export function AdminHome() {
  const router = useRouter();
  const [configured, setConfigured] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [password, setPassword] = useState('');
  const [title, setTitle] = useState('Đấu trường tri thức lớp HCM202');
  const [practiceReuse, setPracticeReuse] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const session = await (await fetch('/api/admin/session', { cache: 'no-store' })).json() as { configured: boolean; authenticated: boolean };
      setConfigured(session.configured);
      setAuthenticated(session.authenticated);
      if (session.authenticated) {
        const response = await fetch('/api/rooms', { cache: 'no-store' });
        const data = await response.json() as { rooms?: RoomItem[]; error?: string };
        if (!response.ok) throw new Error(data.error || 'Không tải được danh sách phòng.');
        setRooms(data.rooms ?? []);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không kết nối được máy chủ.'); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Không đăng nhập được.');
      setPassword(''); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Đăng nhập thất bại.'); }
    finally { setBusy(false); }
  }

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, practiceReuse }) });
      const data = await response.json() as { code?: string; error?: string };
      if (!response.ok || !data.code) throw new Error(data.error || 'Không tạo được phòng.');
      router.push(`/rooms/${data.code}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tạo được phòng.'); }
    finally { setBusy(false); }
  }

  async function logout() { await fetch('/api/admin/session', { method: 'DELETE' }); setAuthenticated(false); setRooms([]); }

  return <main className="shell admin-page"><header className="topbar"><Link href="/" className="brand"><span className="brand-mark">✦</span> ĐẤU TRƯỜNG TRI THỨC</Link><Link href="/rules">Luật chơi</Link></header><div className="page-intro"><span className="eyebrow">DÀNH CHO NGƯỜI TỔ CHỨC</span><h1>Quản trị giải đấu</h1><p>Tạo phòng, duyệt đội tham gia và theo dõi trận đấu trên bàn học trực tiếp.</p></div>
    {error && <div className="message error" role="alert">{error}</div>}
    {!configured && <div className="paper-panel setup-warning"><h2>Cần cấu hình máy chủ</h2><p>Tạo file <code>.env.local</code> từ <code>.env.example</code>, đặt một mật khẩu <code>ADMIN_PASSWORD</code> dài ít nhất 12 ký tự và khởi động lại Next.js.</p></div>}
    {configured && !authenticated && <form className="paper-panel narrow-form" onSubmit={login}><h2>Đăng nhập Admin</h2><label className="field-label" htmlFor="admin-password">Mật khẩu quản trị</label><input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /><button className="button primary" disabled={busy}>{busy ? 'Đang xác thực…' : 'Đăng nhập'}</button></form>}
    {authenticated && <div className="admin-layout"><section className="paper-panel"><div className="panel-heading"><h2>Tạo phòng mới</h2><button type="button" className="text-button" onClick={logout}>Đăng xuất</button></div><form onSubmit={create} className="stack"><label className="field-label" htmlFor="room-title">Tên giải đấu</label><input id="room-title" value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} maxLength={80} required /><label className="checkbox-row"><input type="checkbox" checked={practiceReuse} onChange={(event) => setPracticeReuse(event.target.checked)} /><span><strong>Chế độ chơi thử</strong><small>Dùng lại bộ 20 câu mẫu ở các trận. Các đội có thể gặp lại câu hỏi.</small></span></label><button className="button primary" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo phòng thi'}</button></form></section><section className="paper-panel"><h2>Phòng của bạn</h2>{rooms.length === 0 ? <p className="muted">Chưa có phòng nào. Tạo một phòng để bắt đầu.</p> : <div className="room-list">{rooms.map((room) => <Link href={`/rooms/${room.code}`} className="room-row" key={room.code}><span><strong>{room.title}</strong><small>Mã {room.code} · {room.approved}/4 đội đã duyệt</small></span><span className="status-pill">{room.active ? 'Đang thi đấu' : 'Mở phòng'}</span></Link>)}</div>}</section></div>}
  </main>;
}
