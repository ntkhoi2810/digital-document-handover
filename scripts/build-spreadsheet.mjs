import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = path.resolve("outputs");
const outputPath = path.join(outputDir, "digital-document-handover-data.xlsx");
const previewPath = path.join(outputDir, "spreadsheet-preview.png");

const workbook = Workbook.create();
const brand = "#005AAB";
const brandLight = "#EAF3FB";
const headerText = "#FFFFFF";
const bodyFont = "Arial";

const schemas = {
  Settings: ["key", "value", "description", "updated_at", "updated_by"],
  Admins: ["email", "name", "role", "active", "created_at", "updated_at"],
  Students: ["student_id", "email", "full_name", "class_name", "active", "created_at", "updated_at", "updated_by"],
  DocumentTypes: ["type_id", "name", "description", "tracks_progress", "workflow_version_id", "active", "sort_order", "created_at", "updated_at", "handover_mode"],
  WorkflowVersions: ["workflow_version_id", "name", "version", "active", "created_at", "created_by"],
  WorkflowSteps: ["step_id", "workflow_version_id", "step_order", "name", "status_label", "created_at"],
  Documents: ["document_id", "document_code", "student_id", "student_email", "student_name", "class_name", "type_id", "type_name", "workflow_version_id", "current_step_id", "current_step_order", "status", "storage_status", "submitted_at", "expected_at", "updated_at", "updated_by", "public_note", "internal_note", "version", "active"],
  DocumentEvents: ["event_id", "document_id", "event_type", "from_step_id", "to_step_id", "status", "public_note", "internal_note", "created_at", "created_by"],
  Transactions: ["transaction_id", "transaction_code", "student_id", "student_email", "student_name", "class_name", "transaction_type", "status", "student_note", "request_token", "created_at", "updated_at", "reviewed_by"],
  TransactionItems: ["item_id", "transaction_id", "type_id", "type_name", "document_id", "related_document_id", "status", "admin_note", "created_at", "reviewed_at", "reviewed_by"],
  ServiceSessions: ["session_id", "student_id", "student_email", "student_name", "class_name", "document_id", "recording_type", "started_at", "ended_at", "duration_minutes", "topic", "result", "staff_email", "note", "status", "created_at", "updated_at"],
  Notifications: ["notification_id", "student_email", "document_id", "title", "message", "read", "created_at", "created_by"],
  EmailQueue: ["email_id", "recipient", "subject", "body", "status", "attempts", "last_error", "created_at", "sent_at"],
  AuditLog: ["audit_id", "action", "entity_type", "entity_id", "actor_email", "detail_json", "created_at"],
};

const seed = {
  Settings: [
    ["APP_NAME", "Sổ giao nhận hồ sơ", "Tên hiển thị của ứng dụng", "", ""],
    ["OFFICE_NAME", "Văn phòng Khoa", "Tên đơn vị vận hành", "", ""],
    ["QR_PATH", "?view=transaction", "Đường dẫn gắn vào mã QR in tại quầy", "", ""],
    ["TIMEZONE", "Asia/Ho_Chi_Minh", "Múi giờ vận hành", "", ""],
    ["SCHEMA_VERSION", "2", "Phiên bản cấu trúc dữ liệu", "", ""],
  ],
  Admins: [["nguyenthaikhoi@tdtu.edu.vn", "Nguyễn Thái Khôi", "SUPER_ADMIN", true, "", ""]],
  DocumentTypes: [
    ["nckh_registration", "Hồ sơ đăng ký NCKH", "Hồ sơ đăng ký nghiên cứu khoa học", true, "wf_nckh_v1", true, 1, "", "", "BOTH"],
    ["topic_registration", "Hồ sơ đăng ký đề tài", "Hồ sơ đăng ký đề tài", true, "wf_nckh_v1", true, 2, "", "", "BOTH"],
    ["topic_acceptance", "Hồ sơ nghiệm thu đề tài", "Hồ sơ nghiệm thu đề tài", true, "wf_nckh_v1", true, 3, "", "", "BOTH"],
    ["degree", "Bằng tốt nghiệp", "Văn bằng chờ sinh viên đến nhận", false, "", true, 4, "", "", "BOTH"],
    ["transcript", "Bảng điểm", "Bảng điểm và phụ lục", false, "", true, 5, "", "", "BOTH"],
    ["certificate", "Chứng chỉ", "Chứng chỉ do văn phòng quản lý", false, "", true, 6, "", "", "BOTH"],
    ["request_form", "Đơn đề nghị", "Các loại đơn đề nghị", true, "wf_nckh_v1", true, 7, "", "", "BOTH"],
    ["confirmation", "Giấy xác nhận", "Giấy xác nhận sinh viên", true, "wf_nckh_v1", true, 8, "", "", "BOTH"],
    ["internship_intro", "Giấy giới thiệu thực tập", "Giấy giới thiệu thực tập", false, "", true, 9, "", "", "RECEIVE"],
    ["student_confirmation_visa", "Giấy xác nhận sinh viên (Gia hạn visa)", "Giấy xác nhận sinh viên (Gia hạn visa)", false, "", true, 10, "", "", "RECEIVE"],
    ["student_confirmation_internal_internship", "Giấy xác nhận sinh viên (Thực tập trong trường)", "Giấy xác nhận sinh viên (Thực tập trong trường)", false, "", true, 11, "", "", "RECEIVE"],
    ["scholarship_certificate_2025_2026_hk1", "Giấy khen Học bổng KKHT HK1/2025-2026", "Giấy khen Học bổng KKHT HK1/2025-2026", false, "", true, 12, "", "", "RECEIVE"],
    ["student_research_award_2025_2026", "Hồ sơ khen thưởng NCKHSV 2025-2026", "Hồ sơ khen thưởng NCKHSV 2025-2026", true, "wf_nckh_v1", true, 13, "", "", "SUBMIT"],
    ["graduation_thesis_bonus_or_replacement", "Hồ sơ cộng điểm KLTN/Thay thế tốt nghiệp", "Hồ sơ cộng điểm KLTN/Thay thế tốt nghiệp", true, "wf_nckh_v1", true, 14, "", "", "SUBMIT"],
    ["enterprise_scholarship", "Hồ sơ xét học bổng doanh nghiệp", "Hồ sơ xét học bổng doanh nghiệp", true, "wf_nckh_v1", true, 15, "", "", "SUBMIT"],
  ],
  WorkflowVersions: [["wf_nckh_v1", "Quy trình xử lý hồ sơ", 1, true, "", "nguyenthaikhoi@tdtu.edu.vn"]],
  WorkflowSteps: [
    ["wf_nckh_v1_s1", "wf_nckh_v1", 1, "Tiếp nhận hồ sơ", "Đã tiếp nhận", ""],
    ["wf_nckh_v1_s2", "wf_nckh_v1", 2, "Kiểm tra hồ sơ", "Đang kiểm tra hồ sơ", ""],
    ["wf_nckh_v1_s3", "wf_nckh_v1", 3, "Trình duyệt hồ sơ", "Đang trình duyệt", ""],
    ["wf_nckh_v1_s4", "wf_nckh_v1", 4, "Chờ kết quả phê duyệt", "Chờ phê duyệt", ""],
    ["wf_nckh_v1_s5", "wf_nckh_v1", 5, "Hoàn tất xử lý", "Đã hoàn thành", ""],
  ],
};

function styleSheet(sheet, headers, rowCount) {
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(1);
  const used = sheet.getRangeByIndexes(0, 0, Math.max(rowCount, 2), headers.length);
  used.format.font = { name: bodyFont, size: 10, color: "#1F2937" };
  used.format.verticalAlignment = "center";
  const header = sheet.getRangeByIndexes(0, 0, 1, headers.length);
  header.format = {
    fill: brand,
    font: { name: bodyFont, size: 10, bold: true, color: headerText },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "outside", style: "thin", color: "#004681" },
  };
  header.format.rowHeight = 30;
  if (rowCount > 1) {
    sheet.getRangeByIndexes(1, 0, rowCount - 1, headers.length).format.borders = {
      insideHorizontal: { style: "thin", color: "#E5E7EB" },
      bottom: { style: "thin", color: "#D1D5DB" },
    };
  }
  used.format.autofitColumns();
  for (let col = 0; col < headers.length; col += 1) {
    const cell = sheet.getCell(0, col);
    const name = headers[col];
    const range = sheet.getRangeByIndexes(0, col, Math.max(rowCount, 2), 1);
    const width = /note|description|body|detail|message|topic|result/.test(name) ? 28 : /_at|date|time/.test(name) ? 18 : 16;
    range.format.columnWidth = width;
    cell.format.fill = brand;
  }
  sheet.tabColor = sheet.name === "Settings" ? brand : brandLight;
}

for (const [name, headers] of Object.entries(schemas)) {
  const sheet = workbook.worksheets.add(name);
  const rows = seed[name] || [];
  sheet.getRangeByIndexes(0, 0, 1, headers.length).values = [headers];
  if (rows.length) sheet.getRangeByIndexes(1, 0, rows.length, headers.length).values = rows;
  styleSheet(sheet, headers, rows.length + 1);
}

workbook.recalculate();
await fs.mkdir(outputDir, { recursive: true });
const check = await workbook.inspect({
  kind: "table",
  range: "DocumentTypes!A1:J16",
  include: "values,formulas",
  tableMaxRows: 16,
  tableMaxCols: 10,
});
console.log(check.ndjson);
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);
const preview = await workbook.render({ sheetName: "DocumentTypes", range: "A1:J16", scale: 1.5, format: "png" });
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({ outputPath, previewPath }));
