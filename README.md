# Digital Document Handover & Student Service System

Ứng dụng Google Apps Script + Google Sheets dành cho một văn phòng TDTU.

## Chức năng

- Xác thực email sinh viên `@student.tdtu.edu.vn` từ phiên Google; quản trị viên mặc định là `nguyenthaikhoi@tdtu.edu.vn`.
- Sinh viên hoàn thiện họ tên và lớp; MSSV lấy từ phần trước `@` và không cho tự sửa.
- QR in tại quầy, yêu cầu nộp/nhận/bổ sung và cán bộ đối chiếu sinh viên trước khi xác nhận một hoặc nhiều giấy tờ.
- Danh mục hồ sơ phân loại `SUBMIT`, `RECEIVE` hoặc `BOTH`; sinh viên có thể chọn loại hồ sơ đến nhận mà không cần tạo sẵn hồ sơ cá nhân.
- Hồ sơ, tồn lưu tại văn phòng, quy trình tùy chỉnh, timeline tiến độ, phản hồi công khai/nội bộ.
- Ghi nhận tiếp sinh viên trực tiếp hoặc thủ công, thông báo trong ứng dụng, email tùy chọn, báo cáo CSV và nhật ký kiểm toán.

## Cấu trúc dữ liệu

Ứng dụng dùng 14 tab: `Settings`, `Admins`, `Students`, `DocumentTypes`, `WorkflowVersions`, `WorkflowSteps`, `Documents`, `DocumentEvents`, `Transactions`, `TransactionItems`, `ServiceSessions`, `Notifications`, `EmailQueue`, `AuditLog`.

Không đổi tên tab hoặc hàng tiêu đề. Không chia sẻ Google Sheets cho sinh viên; web app chạy bằng quyền tài khoản triển khai.

Phiên bản cấu trúc dữ liệu hiện tại là `2`. Lần mở đầu tiên sau khi cập nhật sẽ tự thêm cột `handover_mode` vào cuối tab `DocumentTypes` và gán `BOTH` cho dữ liệu cũ. Ứng dụng không tự tạo danh mục hoặc quy trình mẫu; quản trị viên chủ động cấu hình dữ liệu vận hành thực tế.

## Triển khai

1. Tạo/import Google Sheets và lấy spreadsheet ID.
2. Tạo Apps Script project, đẩy các tệp bằng `clasp push`.
3. Đặt Script Property `SPREADSHEET_ID` bằng spreadsheet ID.
4. Chạy `setupSystem()` một lần và cấp quyền.
5. Deploy dạng Web app, chạy bằng tài khoản triển khai. Mọi tài khoản Google có thể mở URL nhưng mã máy chủ chỉ chấp nhận sinh viên TDTU và quản trị viên đã cấp quyền.

Sau triển khai phải kiểm thử bằng một tài khoản sinh viên thực tế để xác nhận `Session.getActiveUser().getEmail()` trả đúng email TDTU trong cấu hình Google Workspace của trường.
