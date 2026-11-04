# Cài Quầy lên VPS

Máy chủ Quầy giữ dữ liệu của tiệm trên VPS của bạn. Sau khi cài:
- Mọi máy trong tiệm (máy quầy, iPad của thợ, điện thoại chủ tiệm) dùng chung dữ liệu, cập nhật ngay lập tức.
- Khách đặt lịch online, lịch hiện ngay trên máy quầy; máy chủ chặn đặt trùng giờ.
- Thẻ quà tặng không thể bị dùng hai lần cùng lúc ở hai máy.
- Tự gửi SMS xác nhận khi khách đặt lịch, và SMS nhắc lịch trước 24 giờ (nếu bật SMS).
- Bán thẻ quà tặng online qua Stripe (nếu bật Stripe).
- Tự sao lưu dữ liệu mỗi ngày, giữ 30 bản gần nhất.

## 1. Chuẩn bị
- **VPS** chạy Ubuntu 22.04 hoặc 24.04 (hoặc Debian 12). RAM 1 GB là đủ.
- **Tên miền** (nên có), ví dụ `book.lumi-nails.com.au`. Vào trang quản lý tên miền, tạo bản ghi **A** trỏ về địa chỉ IP của VPS.
  Có tên miền thì app tự có HTTPS (ổ khoá xanh). Stripe và iPhone đều cần HTTPS để chạy ổn định.

## 2. Cài đặt (khoảng 5 phút)
Đăng nhập vào VPS bằng SSH, rồi chạy:

```bash
git clone https://github.com/truongthanhtamdev/pick-.git quay
```

```bash
cd quay/quay-server && sudo bash install.sh
```

Script sẽ hỏi **tên miền** và **mật khẩu đăng nhập của tiệm**, sau đó tự cài Docker và chạy app.
Cuối cùng nó in ra địa chỉ của app, ví dụ `https://book.lumi-nails.com.au`.

> Nếu repo đang để **private**, lệnh `git clone` sẽ hỏi tài khoản GitHub. Dùng **Personal access token** thay cho mật khẩu.

## 3. Lần đầu mở app
1. Mở địa chỉ app, nhập mật khẩu tiệm.
2. Chọn **"Bắt đầu cho tiệm thật"**. App có sẵn danh sách dịch vụ nail và 4 thợ mẫu để sửa.
3. Vào **Cài đặt** và sửa:
   - tên tiệm, địa chỉ, số điện thoại, **ABN**, **PayID**;
   - **Thợ & giờ làm** (tên thợ, giờ mở cửa / đóng cửa);
   - **Dịch vụ cho khách đặt online** (tên tiếng Anh, số phút, giá);
   - hoa hồng thợ, phụ phí thẻ (nếu tiệm thu).
4. Vào **Dịch vụ & SP** để sửa bảng giá bán tại quầy.

Muốn thử trước thì chọn "Dùng dữ liệu mẫu". Sau đó vào **Cài đặt → Xoá toàn bộ dữ liệu bán hàng** để bắt đầu thật.

## 4. Cài lên từng máy trong tiệm
- Mở địa chỉ app trên iPad hoặc điện thoại, đăng nhập một lần và đặt tên máy (ví dụ "iPad quầy").
- Bấm **Chia sẻ → Thêm vào Màn hình chính** để app hiện như một ứng dụng.
- Mất máy hoặc đổi nhân viên: vào **Cài đặt → Đăng xuất mọi máy**, rồi đổi mật khẩu (xem mục 9).

## 5. Trang đặt lịch cho khách
Link là `https://ten-mien-cua-ban/#dat-lich` (có nút "Chép" trong **Cài đặt → Máy chủ**). Nên gắn vào:
- phần bio của Instagram;
- **Google Business Profile → Đặt lịch hẹn (Booking link)**;
- nút "Book now" trên trang Facebook.

Trang này viết bằng tiếng Anh và tính giờ theo giờ của tiệm (`TZ_SHOP` trong `.env`).

## 6. Bật SMS (xác nhận & nhắc lịch)
1. Đăng ký **ClickSend** (công ty Úc): https://www.clicksend.com/au/ rồi nạp tiền.
2. Vào **Dashboard → Developers → API Credentials**, lấy *Username* và *API Key*.
3. Trên VPS, mở file cấu hình:
   ```bash
   nano ~/quay/quay-server/.env
   ```
   Điền `CLICKSEND_USERNAME`, `CLICKSEND_API_KEY`. Muốn tin nhắn hiện tên tiệm thay vì số điện thoại thì điền `SMS_FROM` (tối đa 11 ký tự, ví dụ `LumiNails`). Lưu ý: ở Úc, tên người gửi dạng chữ phải được đăng ký qua nhà cung cấp SMS theo quy định của ACMA. Chưa đăng ký thì để trống `SMS_FROM`.
4. Chạy lại app:
   ```bash
   cd ~/quay/quay-server && sudo docker compose up -d
   ```
5. Vào **Cài đặt → Máy chủ → Gửi SMS thử** để kiểm tra.

Dùng **Twilio** cũng được: điền `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` thay cho ClickSend.

**Khi nào gửi SMS?** Lúc khách đặt online, máy chủ gửi tin xác nhận. Trước giờ hẹn khoảng 24 giờ, máy chủ gửi tin nhắc. Trong lịch hẹn còn có nút "Gửi SMS xác nhận" để gửi tay cho lịch do tiệm tạo.

## 7. Bật bán thẻ quà tặng online (Stripe)
1. Đăng ký https://stripe.com/au, điền thông tin doanh nghiệp (ABN) và tài khoản ngân hàng.
2. Vào **Developers → API keys**, copy **Secret key** (`sk_live_...`) vào `STRIPE_SECRET_KEY` trong file `.env`.
3. Vào **Developers → Webhooks → Add endpoint**:
   - URL: `https://ten-mien-cua-ban/api/stripe/webhook`
   - Event: `checkout.session.completed`
   - copy **Signing secret** (`whsec_...`) vào `STRIPE_WEBHOOK_SECRET`.
4. Chạy lại app: `sudo docker compose up -d`.

Trang đặt lịch sẽ có thêm tab **"Buy a gift card"**. Khách trả tiền bằng thẻ trên trang của Stripe. Thanh toán xong, khách thấy mã thẻ ngay và nhận thêm SMS có mã (nếu đã bật SMS). Thẻ hiện ngay trong mục **Thẻ quà tặng** của tiệm.

> Nên thử trước bằng khoá test (`sk_test_...`) và số thẻ test `4242 4242 4242 4242`, rồi mới đổi sang khoá live.

## 8. Sao lưu và khôi phục
- Bản sao lưu tự động nằm ở `~/quay/quay-server/data/backups/`, mỗi ngày một file, giữ 30 ngày.
- Nên tải bản sao lưu về máy khác định kỳ (chạy lệnh này trên máy tính của bạn, không phải trên VPS):
  ```bash
  scp -r root@IP-CUA-VPS:~/quay/quay-server/data/backups ./quay-backups
  ```
- Khôi phục: dừng app, thay file `data/quay.db` bằng file sao lưu, rồi chạy lại:
  ```bash
  cd ~/quay/quay-server && sudo docker compose down
  ```
  ```bash
  sudo cp data/backups/quay-2026-11-01.db data/quay.db && sudo rm -f data/quay.db-wal data/quay.db-shm
  ```
  ```bash
  sudo docker compose up -d
  ```

## 9. Việc thường làm
- **Cập nhật phiên bản mới:**
  ```bash
  cd ~/quay && git pull && cd quay-server && sudo docker compose up -d --build
  ```
- **Đổi mật khẩu tiệm:** sửa `SHOP_PASSWORD` trong `.env`, chạy `sudo docker compose up -d`, rồi vào **Cài đặt → Đăng xuất mọi máy**.
- **Xem nhật ký khi có lỗi:**
  ```bash
  cd ~/quay/quay-server && sudo docker compose logs --tail 100 app
  ```

## 10. Cần biết
- Khi tiệm **mất mạng**: app báo "Mất kết nối" và tự gửi lại những gì đã nhập khi có mạng. Đừng tải lại trang trong lúc mất mạng; nếu lỡ tải lại thì phải chờ có mạng mới mở được.
- Máy EFTPOS chưa kết nối trực tiếp với app: thợ nhập số tiền trên máy cà thẻ, rồi bấm xác nhận trong app.
- Đặt cọc khi khách đặt lịch online chưa có. Có thể làm thêm bằng Stripe nếu cần.
