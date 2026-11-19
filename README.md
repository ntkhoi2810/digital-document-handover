# Digital Document Handover & Student Service System

Ứng dụng Google Apps Script + Google Sheets dành cho một văn phòng TDTU.

## Chức năng

- Xác thực email sinh viên `@student.tdtu.edu.vn` từ phiên Google; quản trị viên mặc định là `nguyenthaikhoi@tdtu.edu.vn`.
- Sinh viên hoàn thiện họ tên và lớp; MSSV lấy từ phần trước `@` và không cho tự sửa.
- Sinh viên gửi yêu cầu nộp/nhận/bổ sung trực tuyến và cán bộ đối chiếu sinh viên tại quầy trước khi xác nhận một hoặc nhiều giấy tờ.
- Sinh viên gửi yêu cầu cấp hồ sơ với select loại giấy tờ, mục đích, số bản và ghi chú; quản trị viên lọc, tìm theo sinh viên/hồ sơ, xử lý theo lô và theo dõi lịch sử.
- Hồ sơ đã chuẩn bị được nối với sổ hồ sơ và phiếu nhận tại quầy; xác nhận bàn giao cập nhật cả hai luồng.
- Danh mục hồ sơ phân loại `SUBMIT`, `RECEIVE` hoặc `BOTH`; sinh viên có thể chọn loại hồ sơ đến nhận mà không cần tạo sẵn hồ sơ cá nhân.
- Hồ sơ, tồn lưu tại văn phòng, quy trình tùy chỉnh, timeline tiến độ, phản hồi công khai/nội bộ.
- Ghi nhận tiếp sinh viên trực tiếp hoặc thủ công, thông báo trong ứng dụng, email tùy chọn, báo cáo CSV và nhật ký kiểm toán.

## Cấu trúc dữ liệu

Ứng dụng dùng 16 tab: `Settings`, `Admins`, `Students`, `DocumentTypes`, `WorkflowVersions`, `WorkflowSteps`, `Documents`, `DocumentEvents`, `DocumentRequests`, `DocumentRequestEvents`, `Transactions`, `TransactionItems`, `ServiceSessions`, `Notifications`, `EmailQueue`, `AuditLog`.

Không đổi tên tab hoặc hàng tiêu đề. Không chia sẻ Google Sheets cho sinh viên; web app chạy bằng quyền tài khoản triển khai.

Phiên bản cấu trúc dữ liệu hiện tại là `5`. Lần mở đầu tiên sau khi cập nhật sẽ tự tạo hai tab yêu cầu, thêm cột liên kết vào `Documents` và `Notifications`, thêm cờ `request_enabled` vào cuối `DocumentTypes`, và gán `false` cho các danh mục hiện có. Quản trị viên chủ động bật yêu cầu cấp cho loại hồ sơ hỗ trợ nhận. Ứng dụng không tự tạo danh mục hoặc quy trình vận hành mẫu.

## Triển khai

1. Tạo/import Google Sheets và lấy spreadsheet ID.
2. Tạo Apps Script project, đẩy các tệp bằng `clasp push`.
3. Đặt Script Property `SPREADSHEET_ID` bằng spreadsheet ID.
4. Chạy `setupSystem()` một lần và cấp quyền.
5. Deploy dạng Web app, chạy bằng tài khoản triển khai. Mọi tài khoản Google có thể mở URL nhưng mã máy chủ chỉ chấp nhận sinh viên TDTU và quản trị viên đã cấp quyền.

Sau triển khai phải kiểm thử bằng một tài khoản sinh viên thực tế để xác nhận `Session.getActiveUser().getEmail()` trả đúng email TDTU trong cấu hình Google Workspace của trường.
