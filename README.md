# Quà 20/10 tặng Bùi Núi Đây

## Cài đặt Supabase

1. Chạy `supabase.sql` trong Supabase SQL Editor. Bảng `draw_control` sẽ có một dòng với `id = 1` và `enabled = true`.
2. Để chạy trên máy cá nhân, điền `supabase_url` và `supabase_service_role_key` trong `config.json`. Có thể dùng legacy `service_role` key hoặc secret key mới bắt đầu bằng `sb_secret_`. Chỉ dùng key này ở máy chủ; không đưa vào HTML hoặc JavaScript.
3. Nếu có ảnh, thêm JPG với chính xác các tên `serect 1.jpg`, `serect 2.jpg`, `serect 3.jpg`, `serect 4.jpg` vào thư mục `image/` ở gốc dự án hoặc `static/image/`. Ảnh là tùy chọn; khi chưa có ảnh, giao diện hiện thẻ quà thay thế.
4. Khởi chạy ứng dụng Flask như trước.

Mỗi phần thưởng có xác suất 25%. API bắt đầu lượt quay chọn phần thưởng ngẫu nhiên ở phía máy chủ và khóa lượt đó để không có lượt thứ hai đồng thời. Sau đủ 30 giây, API hoàn tất chuyển `enabled` thành `false`. Ứng dụng cũng kiểm tra thời gian ở phía máy chủ.

Để mở lại vòng quay trong Supabase, đặt `enabled = true`, `spin_in_progress = false` và xóa `started_at`, `prize_index`, `completed_at` trên dòng có `id = 1`.

Trên Render, thêm `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` trong phần **Environment** của service. Biến môi trường được ưu tiên hơn giá trị trong `config.json`; không commit key thật vào repository.
