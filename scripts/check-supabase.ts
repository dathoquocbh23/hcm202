import { supabaseRequest } from '../src/lib/server/supabase-rest.ts';

try {
  await supabaseRequest('arena_rooms?select=code,version&limit=1');
  console.log('Supabase: kết nối thành công, bảng arena_rooms đã sẵn sàng.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Không kiểm tra được Supabase.');
  process.exitCode = 1;
}
