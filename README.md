# Đấu Trường Tri Thức

Ứng dụng Next.js cho giải đấu kiến thức bốn đội của lớp HCM202. Hai trận bán kết chọn ra hai đội vào chung kết. Mỗi đội dùng một thiết bị để thi đấu trực tiếp; Admin quản lý giải và theo dõi bàn đấu công khai.

## Chạy ứng dụng

Yêu cầu Node.js **22.13 trở lên** và npm. Từ thư mục mã nguồn:

```powershell
npm install
npm run dev
```

Mở `http://localhost:3000`. Máy chủ lắng nghe mọi giao diện mạng để các thiết bị cùng Wi-Fi có thể truy cập qua địa chỉ IP của máy chạy Next.js. Trên các thiết bị đội thi, dùng `http://<IP-của-máy-chủ>:3000` thay cho `localhost`.

Để xem luồng thi đấu mà không cần tạo phòng hoặc đăng nhập, mở `/demo/desk-flow`. Bản xem thử không đếm giờ và không lưu kết quả. Chọn câu hỏi, đánh kỹ năng công, rồi chuyển sang góc nhìn **Đội Đỏ**: đội thủ đọc câu hỏi và có thể dùng kỹ năng ngay cạnh nút **Chốt đáp án**. Thẻ kỹ năng đã dùng xuất hiện trên bàn học. Nút **Admin theo dõi** cho thấy góc nhìn công khai, không hiển thị bảng chọn hoặc thẻ riêng của đội.

File `.env.local` cần có `ADMIN_PASSWORD` dài tối thiểu 12 ký tự. Đổi mật khẩu trong file này rồi khởi động lại server nếu muốn thay mật khẩu quản trị. File này được loại khỏi Git. Ứng dụng lưu phòng và diễn biến vào `data/arena.sqlite` để tiếp tục sau khi khởi động lại.

## Tổ chức một giải

1. Admin đăng nhập tại `/admin` và tạo phòng. Chọn **Chế độ chơi thử** nếu muốn dùng lại cùng bộ câu hỏi mẫu ở cả ba trận.
2. Gửi mã phòng hoặc liên kết tham gia cho bốn đội. Mỗi đội nhập tên, chờ duyệt, rồi bấm **Đội tôi đã sẵn sàng**.
3. Admin duyệt đủ bốn đội, bốc thăm hai trận bán kết và gán bộ câu hỏi cho từng trận. Chế độ thi chính thức không cho dùng trùng bộ câu hỏi; bộ mẫu chỉ đủ cho một trận.
4. Admin bắt đầu trận khi cả hai đội đã sẵn sàng. Thiết bị của hai đội tự chuyển từ phòng chờ sang bàn học 2.5D. Đến pha cần quyết định, **chỉ thiết bị của đội đó** mở bảng chọn riêng nổi trên bàn học; sau khi xác nhận, bảng đóng và bàn học lại hiện trọn vẹn.
5. Hai trận bán kết có thể chạy song song: bấm **Bắt đầu cả hai bán kết cùng lúc** (hoặc bắt đầu từng trận). Mỗi trận có đồng hồ, nút tạm dừng và liên kết xem riêng. Admin có thể tạm dừng và tiếp tục đồng hồ, nhưng không thao tác thay đội.
6. Để khán giả xem hoặc stream, bấm **Sao chép liên kết** ở mục *Liên kết khán giả · 2 màn hình* (`/rooms/<mã>/live?display=…`). Trang này chỉ xem, hiện hai bàn bán kết cạnh nhau và tự chuyển sang toàn màn hình khi chung kết bắt đầu. Có thể thêm liên kết làm *Browser Source* trong OBS (khuyên dùng 1920×1080). Ai có liên kết đều xem được, nên chỉ gửi cho người cần xem.
7. Sau trận, kết quả và nhật ký xuất hiện trong sơ đồ giải. Hai đội thắng bán kết báo sẵn sàng lần nữa để vào chung kết.

## Bộ câu hỏi

Ứng dụng kèm một bộ mẫu từ tài liệu bài tập gồm 20 câu hỏi, 12 thẻ đáp án và 6 thẻ nhiễu. Admin mở **Bộ câu hỏi** trong phòng để xem đáp án và tải JSON mẫu. Để tổ chức đủ ba trận với câu hỏi riêng, sửa `id`, nội dung, đáp án trong file mẫu và nhập hai bộ JSON mới. Bộ nhập được kiểm tra số lượng, loại câu, ID và sự liên kết giữa câu điền khuyết với thẻ đáp án. Đáp án đúng và thẻ trên tay không được gửi cho đối thủ hoặc màn hình trình chiếu trước khi lật kết quả.

## Kiến trúc

- `src/app`: trang và API Next.js App Router.
- `src/features/game`: luật thi đấu, dữ liệu bộ mẫu, màn hình bàn học và màn hình thao tác.
- `src/features/rooms`: phòng chờ, Admin, thư viện thẻ.
- `src/lib/server`: phiên truy cập, lưu trữ SQLite, chiếu trạng thái riêng cho Admin/đội/trình chiếu.
- `tests/game.test.ts`: kiểm tra luật thi đấu trọng yếu.

Các lệnh kiểm tra: `npm run typecheck`, `npm test`, `npm run build`. Chạy bản production với `npm run build` rồi `npm start`.

Để tự chạy lại một trận demo từ đầu, khởi động server rồi chạy `node tests/live-demo.mjs` trong terminal khác. Script tạo một phòng chơi thử với bốn đội, cho hai đội đấu hai lượt, tạm dừng để xem Admin, sau đó tiếp tục đến kết quả khi nhấn Enter. Phòng demo được giữ trong danh sách Admin để xem lại.

Ứng dụng dùng một tiến trình Node.js và cơ sở dữ liệu SQLite trên cùng máy chủ; không chạy nhiều instance Next.js với cùng file SQLite khi tổ chức giải trực tiếp. Đặt sau HTTPS/reverse proxy nếu mở ra Internet. Khi chỉ sử dụng trong lớp, các thiết bị cần cùng mạng và đồng hồ đếm dựa vào thời gian máy chủ.
