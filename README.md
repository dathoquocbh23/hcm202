# Đấu Trường Tri Thức

Ứng dụng Next.js cho giải đấu kiến thức bốn đội của lớp HCM202. Hai trận bán kết chọn ra hai đội vào chung kết. Mỗi đội dùng một thiết bị để thi đấu trực tiếp; Admin quản lý giải và theo dõi bàn đấu công khai.

## Chạy ứng dụng

Yêu cầu Node.js **22.13 trở lên**, npm và một project Supabase. Từ thư mục mã nguồn:

```powershell
npm install
Copy-Item .env.example .env.local
# Điền cấu hình trong .env.local và chạy SQL theo hướng dẫn dưới đây.
npm run supabase:check
npm run dev
```

Mở `http://localhost:3000`. Máy chủ lắng nghe mọi giao diện mạng để các thiết bị cùng Wi-Fi có thể truy cập qua địa chỉ IP của máy chạy Next.js. Trên các thiết bị đội thi, dùng `http://<IP-của-máy-chủ>:3000` thay cho `localhost`.

Để xem luồng thi đấu mà không cần tạo phòng hoặc đăng nhập, mở `/demo/desk-flow`. Bản xem thử không đếm giờ và không lưu kết quả. Chọn câu hỏi, đánh kỹ năng công, rồi chuyển sang góc nhìn **Đội Đỏ**: đội thủ đọc câu hỏi và có thể dùng kỹ năng ngay cạnh nút **Chốt đáp án**. Thẻ kỹ năng đã dùng xuất hiện trên bàn học. Nút **Admin theo dõi** cho thấy góc nhìn công khai, không hiển thị bảng chọn hoặc thẻ riêng của đội.

Chỉ sao chép `.env.example` nếu chưa có `.env.local`, tránh ghi đè cấu hình đã điền. Các file môi trường riêng được loại khỏi Git. Ứng dụng lưu phòng, đội, bộ câu hỏi, diễn biến và kết quả trong Supabase PostgreSQL; không còn dùng SQLite.

## Thiết lập Supabase

1. Trong project Supabase, mở **SQL Editor**, dán nội dung [`supabase/migrations/001_arena_rooms.sql`](supabase/migrations/001_arena_rooms.sql) và bấm **Run**.
2. Mở **Settings → API Keys**, lấy **Secret key** (`sb_secret_...`). Điền vào `.env.local`:

   ```dotenv
   SUPABASE_URL=https://slppvgumlwuuclqgnevt.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_thay_bang_khoa_cua_ban
   ADMIN_PASSWORD=thay-bang-mat-khau-rieng-it-nhat-12-ky-tu
   ```

URL cũng có thể đặt bằng `NEXT_PUBLIC_SUPABASE_URL`. Nếu có cả hai biến, ứng dụng ưu tiên `SUPABASE_URL`. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` không được dùng trong luồng API hiện tại; server vẫn cần khóa bí mật riêng.

3. Chạy `npm run supabase:check`. Lệnh này chỉ kiểm tra kết nối và đọc bảng, không tạo hay sửa dữ liệu.
4. Chạy `npm run dev`, vào `/admin`, đăng nhập bằng `ADMIN_PASSWORD` và tạo phòng chơi thử đầu tiên. Ba bộ câu hỏi có sẵn tự được thêm vào phòng.

Khóa Supabase chỉ nằm trên server, không thêm tiền tố `NEXT_PUBLIC_`. Nếu project dùng khóa cũ, đặt `SUPABASE_SERVICE_ROLE_KEY` thay cho `SUPABASE_SECRET_KEY`. Publishable/anon key không đủ quyền cho kiến trúc này. Bảng `arena_rooms` bật RLS và không cấp quyền cho `anon`/`authenticated`; trình duyệt truy cập qua API Next.js đã kiểm tra phiên Admin/đội/khán giả. Không tạo policy cho phép công khai đọc `body`, vì trường này có đáp án và thẻ riêng của đội. Xem [tài liệu API keys của Supabase](https://supabase.com/docs/guides/getting-started/api-keys).

Không cần bật Supabase Auth, Storage hoặc Realtime cho các chức năng hiện tại. Đăng nhập Admin và phiên đội dùng cookie của ứng dụng; màn hình lấy trạng thái qua API mỗi 1,2 giây. Đổi `ADMIN_PASSWORD` sẽ vô hiệu phiên Admin cũ và ảnh hưởng liên kết khán giả của phòng đã tạo, nên giữ cùng mật khẩu khi chuyển môi trường.

## Deploy lên Vercel

1. Đưa code lên repository rồi import repository đó vào Vercel. Chọn framework **Next.js**, Node.js **22.x** hoặc **24.x**. Dùng lệnh build mặc định `npm run build`.
2. Thêm `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (hoặc `SUPABASE_SERVICE_ROLE_KEY`) và `ADMIN_PASSWORD` trong **Project Settings → Environment Variables** cho **Production**. Điền giá trị thật, không dùng giá trị mẫu và không đặt dấu nháy bao quanh giá trị trong giao diện Vercel.
3. Deploy. Nếu thêm hoặc đổi biến môi trường sau đó, redeploy để bản chạy nhận cấu hình mới.
4. Vào `/admin` trên tên miền Vercel, tạo phòng, thử tham gia bằng cửa sổ khác và kiểm tra danh sách đội. Sau đó gửi liên kết Vercel cho các đội; các thiết bị chỉ cần Internet.

Giao diện và API được deploy chung trên Vercel. Không cần server Node.js riêng, file database trên Vercel, cron hay Supabase Edge Functions. Nếu dùng Preview, nên cấu hình một project Supabase khác để phòng chơi thử không chung dữ liệu Production. Xem [Vercel Functions](https://vercel.com/docs/functions).

## Tổ chức một giải

1. Admin đăng nhập tại `/admin` và tạo phòng. Chọn **Chế độ chơi thử** nếu muốn dùng lại cùng bộ câu hỏi mẫu ở cả ba trận.
2. Gửi mã phòng hoặc liên kết tham gia cho bốn đội. Mỗi đội nhập tên, chờ duyệt, rồi bấm **Đội tôi đã sẵn sàng**.
3. Admin duyệt đủ bốn đội, bốc thăm hai trận bán kết và gán bộ câu hỏi cho từng trận. Khi bốc thăm, Bộ 1, 2, 3 được tự gán cho Bán kết A, Bán kết B và Chung kết; Admin có thể đổi trên sơ đồ. Chế độ thi chính thức không cho dùng trùng bộ câu hỏi.
4. Admin bắt đầu trận khi cả hai đội đã sẵn sàng. Thiết bị của hai đội tự chuyển từ phòng chờ sang bàn học 2.5D. Đến pha cần quyết định, **chỉ thiết bị của đội đó** mở bảng chọn riêng nổi trên bàn học; sau khi xác nhận, bảng đóng và bàn học lại hiện trọn vẹn.
5. Hai trận bán kết có thể chạy song song: bấm **Bắt đầu cả hai bán kết cùng lúc** (hoặc bắt đầu từng trận). Mỗi trận có đồng hồ, nút tạm dừng và liên kết xem riêng. Admin có thể tạm dừng và tiếp tục đồng hồ, nhưng không thao tác thay đội.
6. Để khán giả xem hoặc stream, bấm **Sao chép liên kết** ở mục *Liên kết khán giả · 2 màn hình* (`/rooms/<mã>/live?display=…`). Trang này chỉ xem, hiện hai bàn bán kết cạnh nhau và tự chuyển sang toàn màn hình khi chung kết bắt đầu. Có thể thêm liên kết làm *Browser Source* trong OBS (khuyên dùng 1920×1080). Ai có liên kết đều xem được, nên chỉ gửi cho người cần xem.
7. Sau trận, kết quả và nhật ký xuất hiện trong sơ đồ giải. Hai đội thắng bán kết báo sẵn sàng lần nữa để vào chung kết.

## Bộ câu hỏi

Ứng dụng kèm ba bộ câu hỏi từ tài liệu *Đấu Trường Tri Thức – Bản góp ý v2*, mỗi bộ gồm 20 câu hỏi (14 điền khuyết, 6 ABC), 12 thẻ đáp án và 6 thẻ nhiễu: Bộ 1 (`sample-set.json`, các luận điểm cốt lõi), Bộ 2 (`set-2-ban-ket-b.json`, văn kiện và mốc lịch sử), Bộ 3 (`set-3-chung-ket.json`, trích dẫn và cơ sở lý luận, khó hơn). Mọi phòng mới đều có sẵn cả ba bộ. Admin mở **Bộ câu hỏi** trong phòng để xem đáp án và tải JSON; muốn dùng bộ riêng thì sửa `id`, nội dung, đáp án trong file tải về rồi nhập JSON. Bộ nhập được kiểm tra số lượng, loại câu, ID và sự liên kết giữa câu điền khuyết với thẻ đáp án. Đáp án đúng và thẻ trên tay không được gửi cho đối thủ hoặc màn hình trình chiếu trước khi lật kết quả.

## Kiến trúc

- `src/app`: trang và API Next.js App Router.
- `src/features/game`: luật thi đấu, dữ liệu ba bộ câu hỏi, màn hình bàn học và màn hình thao tác.
- `src/features/rooms`: phòng chờ, Admin, thư viện thẻ.
- `src/lib/server`: phiên truy cập, lưu trữ Supabase qua REST API, chiếu trạng thái riêng cho Admin/đội/trình chiếu.
- `supabase/migrations`: SQL tạo bảng và quyền truy cập.
- `tests/game.test.ts`: kiểm tra luật thi đấu trọng yếu.
- `tests/room-store.test.ts`: kiểm tra lưu trữ, thao tác đồng thời, chống lệnh trùng, đồng hồ và dữ liệu riêng bằng REST giả lập; không thay thế kiểm tra trên Supabase thật.

Các lệnh kiểm tra: `npm run typecheck`, `npm test`, `npm run build`. Chạy bản production với `npm run build` rồi `npm start`.

Để tự chạy lại một trận demo từ đầu, khởi động server rồi chạy `node tests/live-demo.mjs` trong terminal khác. Script tạo một phòng chơi thử với bốn đội, cho hai đội đấu hai lượt, tạm dừng để xem Admin, sau đó tiếp tục đến kết quả khi nhấn Enter. Phòng demo được giữ trong danh sách Admin để xem lại.

Mỗi lần ghi kiểm tra cột `version` trên Supabase để tránh ghi đè khi nhiều instance Vercel cập nhật cùng một phòng. Heartbeat tăng phiên bản lưu trữ nhưng không làm mất hiệu lực thao tác trên giao diện. Đồng hồ dựa trên deadline lưu trong database; API xử lý các mốc đã hết hạn khi có yêu cầu tiếp theo, không dùng `setInterval` nền. Nếu tất cả thiết bị đóng trang, trạng thái lưu được cập nhật khi có người mở lại, theo thời gian đã trôi qua; hãy tạm dừng trận trước khi nghỉ nếu muốn giữ nguyên thời gian. Máy chạy local cũng cần Internet để kết nối Supabase.
