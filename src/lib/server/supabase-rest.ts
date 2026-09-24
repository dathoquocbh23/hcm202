/** Server-side only. Never import this module from a client component. */
export class SupabaseError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, code?: string) {
    const hint = status === 401 || status === 403
      ? 'Kiểm tra SUPABASE_SECRET_KEY trên server.'
      : code === 'PGRST205' || code === '42P01'
        ? 'Chạy supabase/migrations/001_arena_rooms.sql trong Supabase SQL Editor.'
        : 'Vui lòng thử lại hoặc kiểm tra cấu hình Supabase.';
    super(`Không truy cập được dữ liệu Supabase (${status}). ${hint}`);
    this.status = status;
    this.code = code;
  }
}

export async function supabaseRequest<T>(resource: string, init: RequestInit = {}): Promise<T> {
  const base = (process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim())?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!base || !key) throw new Error('Thiếu SUPABASE_URL (hoặc NEXT_PUBLIC_SUPABASE_URL) hoặc SUPABASE_SECRET_KEY trong cấu hình server.');
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('SUPABASE_URL phải là URL HTTPS gốc của project Supabase.');
  }
  if (!key.startsWith('sb_secret_')) {
    let role: unknown;
    try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { /* Invalid legacy key. */ }
    if (role !== 'service_role') throw new Error('Cần Secret key hoặc service_role key phía server, không dùng publishable/anon key.');
  }
  const headers = new Headers(init.headers);
  headers.set('apikey', key);
  if (!key.startsWith('sb_secret_')) headers.set('Authorization', `Bearer ${key}`);
  headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`${base}/rest/v1/${resource}`, {
      ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(10_000), redirect: 'error'
    });
  } catch {
    throw new Error('Không kết nối được Supabase. Vui lòng kiểm tra mạng và thử lại.');
  }
  if (!response.ok) {
    const details = await response.json().catch(() => ({})) as { code?: string };
    // Never return the response body: it can contain private room data.
    throw new SupabaseError(response.status, details.code);
  }
  const body = await response.text();
  return (body ? JSON.parse(body) : undefined) as T;
}
