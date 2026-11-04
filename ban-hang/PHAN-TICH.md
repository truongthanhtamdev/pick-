# Phân tích Square Dashboard (app.squareup.com) & thiết kế "Quầy"

## 1. Square Dashboard là gì

Đây là trang quản trị web của Square, một nền tảng bán hàng (POS) và thanh toán cho cửa hàng nhỏ: quán cà phê, nhà hàng, bán lẻ, salon, spa. Chủ cửa hàng bán hàng trên máy POS hoặc điện thoại. Mọi dữ liệu dồn về dashboard này để quản lý.

### Các module chính

| Module | Chức năng |
|---|---|
| **Home** | Doanh thu hôm nay / tuần, so sánh kỳ trước, giao dịch gần đây, gợi ý thao tác |
| **Items & Orders** | Thư viện món/sản phẩm, danh mục, biến thể, modifier, tồn kho, đơn online |
| **Payments / Transactions** | Danh sách giao dịch, hoàn tiền, in lại hoá đơn, tranh chấp thẻ |
| **Virtual Terminal / POS** | Thu tiền ngay trên trình duyệt |
| **Appointments** | Đặt lịch hẹn: lịch theo nhân viên, dịch vụ, trang đặt lịch online cho khách |
| **Customers** | Danh bạ khách, lịch sử mua, nhóm khách, loyalty |
| **Reports** | Sales summary, theo món, theo danh mục, theo giờ, theo nhân viên, xuất CSV |
| **Invoices** | Tạo và gửi hoá đơn, thu tiền online |
| **Staff** | Nhân viên, phân quyền, chấm công |
| **Online / Marketing / Banking** | Website bán hàng, email marketing, nhận tiền về tài khoản |
| **Settings** | Thông tin cửa hàng, thuế, thiết bị, phương thức thanh toán |

### Điểm mạnh
- Gom đủ mọi thứ vào một chỗ: bán hàng, kho, khách, báo cáo, lịch hẹn.
- KPI có so sánh với kỳ trước, đọc là biết tình hình ngay.
- Thu tiền nhanh, hoá đơn rõ ràng, hoàn tiền dễ.
- Có lịch hẹn kèm trang đặt lịch online cho ngành dịch vụ.

### Điểm yếu (cơ hội để làm tốt hơn)
1. **Menu quá dày**: hơn 10 mục, nhiều mục con, lại xen nhiều quảng cáo bán thêm (upsell). Người mới dễ bị ngợp.
2. **Chậm và nặng**: nhiều trang tải lại toàn bộ, phải bấm qua nhiều cấp.
3. **Giao diện desktop là chính**: trên điện thoại dashboard khó dùng.
4. **Chưa hợp với Việt Nam**: không có chuyển khoản QR (VietQR) hay ví MoMo/ZaloPay, không định dạng tiền theo kiểu VND, không có tiếng Việt.
5. **Báo cáo nằm rải rác**: muốn biết "giờ nào đông khách" phải mở vài báo cáo.
6. **Không có dark mode và tìm kiếm toàn cục** kiểu Ctrl+K.

## 2. "Quầy" làm tốt hơn ở đâu

| Vấn đề của Square | Cách Quầy xử lý |
|---|---|
| Menu dày | Chỉ 8 mục, mỗi mục có phím tắt 1–8 |
| Không có tìm kiếm nhanh | **Ctrl/⌘ K**: tìm trang, món (Enter để thêm vào đơn), khách, mã đơn |
| Khó dùng trên mobile | Thanh điều hướng dưới, giỏ hàng dạng bottom sheet, form dạng sheet |
| Không có QR/ví VN | Có 4 phương thức: Tiền mặt (gợi ý mệnh giá, tự tính tiền thối), Chuyển khoản QR, Thẻ, Ví điện tử |
| Báo cáo rời rạc | Bản đồ nhiệt **giờ cao điểm** (thứ × giờ), danh mục, lợi nhuận từng món trong một trang |
| Không dark mode | Sáng / Tối / Theo hệ thống |
| Đặt lịch tách rời | Lịch hẹn theo nhân viên, bấm vào ô trống để tạo lịch, tự kiểm tra trùng giờ, "Thu tiền" nối thẳng sang POS. Có trang đặt lịch online cho khách |

## 3. Tính năng đã có trong bản demo (`/ban-hang/`)

- **Tổng quan**: 4 KPI có % so với kỳ trước và sparkline, biểu đồ doanh thu (cột kỳ này, nét đứt kỳ trước), món bán chạy, lịch hẹn hôm nay, phương thức thanh toán, cảnh báo sắp hết hàng, đơn gần đây.
- **Bán hàng (POS)**: lưới món, lọc theo danh mục, tìm kiếm, giỏ hàng, gắn khách, giảm giá % hoặc ₫, VAT, thanh toán, in hoá đơn 80mm. Bán xong tự trừ kho.
- **Lịch hẹn**: lịch ngày theo từng nhân viên, vạch giờ hiện tại, trạng thái (đã đặt / đã đến / hoàn tất / không đến / huỷ), dời lịch, thu tiền, link đặt lịch online.
- **Trang khách đặt lịch** (`#/dat-lich`): chọn dịch vụ, chọn nhân viên hoặc "bất kỳ ai", chọn ngày, chọn giờ trống, nhập thông tin rồi xác nhận.
- **Đơn hàng**: lọc theo phương thức và trạng thái, nhóm theo ngày, xem chi tiết, hoàn tiền (kho được cộng lại), xuất CSV.
- **Sản phẩm**: giá bán, giá vốn, biên lợi nhuận, số lượng bán 30 ngày, tồn kho, thêm / sửa / xoá.
- **Khách hàng**: hạng (Mới / Thân thiết / VIP), tổng chi tiêu, món hay gọi, lịch sử mua, đặt lịch, tạo đơn.
- **Báo cáo**: doanh thu gộp / ròng, giảm giá & hoàn tiền, lợi nhuận gộp, heatmap giờ cao điểm, theo danh mục, hiệu quả từng món.
- **Cài đặt**: thông tin cửa hàng, VAT, tài khoản nhận tiền, giao diện, sao lưu JSON, tạo lại dữ liệu mẫu.

## 4. Giới hạn hiện tại & bước tiếp theo

Bản demo lưu dữ liệu trong `localStorage` của trình duyệt. Mỗi máy có dữ liệu riêng, nên khách đặt lịch online trên máy khác **chưa** đồng bộ về máy chủ cửa hàng. Để chạy thật cần thêm:

1. **Backend + đăng nhập**: Firebase/Firestore (repo đã dùng trong `nhiem-vu/`) để đồng bộ nhiều máy, phân quyền chủ/nhân viên.
2. **VietQR thật**: tạo mã theo chuẩn NAPAS (`img.vietqr.io`) và đối soát qua webhook ngân hàng (Casso / SePay).
3. **Thông báo**: gửi Zalo ZNS / SMS xác nhận và nhắc lịch hẹn.
4. **Nhân viên & ca làm**: chấm công, doanh số theo nhân viên, giờ làm của từng người cho trang đặt lịch.
5. **Biến thể món** (size, topping), combo, in bếp.
6. **PWA offline**: bán hàng được cả khi mất mạng.

## 5. Phiên bản cho tiệm nail ở Úc

Bản demo hiện được cấu hình cho một tiệm nail ở Melbourne. Chủ tiệm và thợ dùng giao diện tiếng Việt; khách dùng tiếng Anh.

| Nhu cầu | Cách app xử lý |
|---|---|
| Tiền tệ, thuế | AUD ($, có cent). Giá đã gồm GST 10%; hoá đơn tự tách tiền GST |
| Hoá đơn hợp lệ | Có chữ **TAX INVOICE**, ABN, địa chỉ và tên thợ phục vụ, viết bằng tiếng Anh |
| Thanh toán | Thẻ / EFTPOS (phổ biến nhất), Tiền mặt (gợi ý $5–$100, tự tính tiền thối), PayID |
| Dịch vụ và hàng bán lẻ | Dịch vụ không tính tồn kho; sản phẩm bán lẻ (cuticle oil, hand cream…) có tồn kho |
| Thợ | Mỗi đơn phải chọn thợ. Tip chọn khi thanh toán, không tính vào doanh thu |
| Lương thợ | Báo cáo theo từng thợ: lượt khách, doanh thu dịch vụ, hoa hồng (%, đổi trong Cài đặt), tip, tổng thợ nhận |
| Đặt lịch online | Trang tiếng Anh: chọn dịch vụ, thợ (hoặc "Any technician"), ngày, giờ |
| Thẻ quà tặng | Mệnh giá $50–$200, in tiếng Anh. **Luật Úc bắt buộc hạn dùng tối thiểu 3 năm**, app không cho đặt thấp hơn |

### Cần bổ sung khi dùng thật
- Đồng bộ nhiều máy (Firebase) để quầy, iPad của thợ và trang đặt lịch online dùng chung dữ liệu.
- Gửi SMS xác nhận và nhắc lịch trước 24 giờ (ví dụ qua Twilio hoặc ClickSend), giảm khách đặt rồi không đến.
- Đặt cọc khi đặt online cho dịch vụ dài (acrylic, Gel-X).
- Phụ phí thẻ (card surcharge) nếu tiệm muốn tính, phải ghi rõ cho khách trước khi thanh toán.
- Bán thẻ quà tặng online qua cổng thanh toán (Stripe).
