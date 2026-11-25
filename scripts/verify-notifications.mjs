import assert from "node:assert/strict";
import fs from "node:fs";

const code = fs.readFileSync("Code.gs", "utf8");
const sentEmails = [];
let failNextEmail = false;
const Utilities = {
  getUuid: () => "12345678-1234-1234-1234-123456789abc",
  formatDate: () => "20261119-120000",
};
const LockService = {getScriptLock: () => ({waitLock() {}, releaseLock() {}})};
const MailApp = {sendEmail: message => {
  if (failNextEmail) {
    failNextEmail = false;
    throw new Error("Simulated delivery failure");
  }
  sentEmails.push(message);
}};

const api = new Function("Utilities", "LockService", "MailApp", `${code}
  return {
    updateDocumentProgress, batchUpdateDocuments, finishServiceSession, addManualServiceSession,
    sanitizeNotificationBody_, sanitizeNotificationTitle_, documentNotificationContent_, serviceNotificationContent_,
    notificationTemplates_, notificationTemplateData_, renderNotificationTemplate_, compileNotificationMessage_, batchUpdateDocumentRequests, reviewTransactionItems, APP,
    setStorage(storage) {
      readTable_ = name => (storage[name] || []).map((row, index) => ({...row, _row: index + 2}));
      findBy_ = (name, field, value) => readTable_(name).find(row => String(row[field] || '').toLowerCase() === String(value || '').toLowerCase()) || null;
      appendRecord_ = (name, record) => { storage[name] ||= []; storage[name].push({...record}); };
      updateRow_ = (name, rowNumber, patch) => Object.assign(storage[name][rowNumber - 2], patch);
      getSheet_ = name => ({getLastRow: () => (storage[name] || []).length + 1});
      getWorkflowSteps_ = workflowId => (storage.WorkflowSteps || []).filter(step => step.workflow_version_id === workflowId).sort((a, b) => Number(a.step_order) - Number(b.step_order));
      assertAdmin_ = () => ({email: "admin@tdtu.edu.vn", role: "ADMIN"});
      resolveStudent_ = () => ({student_id: "52200001", email: "52200001@student.tdtu.edu.vn", full_name: "Nguyễn Văn A", class_name: "K28"});
      getDocumentDetail = documentId => ({documentId});
      getTransactionResult_ = () => ({ok:true});
      audit_ = () => {};
    }
  };
`)(Utilities, LockService, MailApp);

assert.equal(api.sanitizeNotificationBody_(" Dòng một\r\nDòng hai "), "Dòng một\nDòng hai");
assert.equal(api.sanitizeNotificationTitle_("  Tiêu đề\n  email "), "Tiêu đề email");
assert.throws(() => api.sanitizeNotificationBody_("x".repeat(5001)), /5000/);

const storage = {
  Documents: [{
    document_id: "doc_1", document_code: "HS-2026-001", type_id: "type_1", type_name: "Bảng điểm",
    student_id: "52200001", student_name: "Nguyễn Văn A", class_name: "K28",
    workflow_version_id: "wf_1", current_step_id: "step_1", current_step_order: 1,
    student_email: "52200001@student.tdtu.edu.vn", status: "Đã tiếp nhận", version: 1,
    active: true, public_note: "", internal_note: "Không gửi ghi chú nội bộ",
  }, {
    document_id: "doc_2", document_code: "HS-2026-002", type_id: "type_2", type_name: "Bằng tốt nghiệp",
    student_id: "52200001", student_name: "Nguyễn Văn A", class_name: "K28",
    workflow_version_id: "", current_step_id: "", current_step_order: 0,
    student_email: "52200001@student.tdtu.edu.vn", status: "Đã tiếp nhận", version: 1,
    active: true, public_note: "", internal_note: "",
  }],
  WorkflowVersions: [{workflow_version_id: "wf_1", name: "Quy trình cấp bảng điểm", name_en: "Transcript workflow"}],
  WorkflowSteps: [
    {step_id: "step_1", workflow_version_id: "wf_1", step_order: 1, name: "Tiếp nhận", name_en: "Received", status_label: "Đã tiếp nhận", status_label_en: "Received"},
    {step_id: "step_2", workflow_version_id: "wf_1", step_order: 2, name: "Xác minh", name_en: "Verification", status_label: "Đang xử lý", status_label_en: "Processing"},
  ],
  Events: [], Notifications: [], EmailQueue: [],
};
api.setStorage(storage);

api.updateDocumentProgress({documentId: "doc_1", stepId: "step_2", status: "Đã tiếp nhận", publicNote: "Đã chuyển giai đoạn"});
assert.equal(storage.Documents[0].status, "Đang xử lý", "A selected step supplies its status unless the administrator explicitly overrides it");
assert.equal(storage.Documents[0].current_step_id, "step_2");
assert.equal(storage.Notifications[0].title, "Bảng điểm", "Document notification titles use the document name instead of its code");
assert.match(storage.Notifications[0].message, /Quy trình: Quy trình cấp bảng điểm/);
assert.match(storage.Notifications[0].message, /Giai đoạn xử lý: Xác minh/);
assert.match(storage.Notifications[0].message, /Trạng thái: Đang xử lý/);
assert.doesNotMatch(storage.Notifications[0].message, /Không gửi ghi chú nội bộ/);
const versionBeforeInvalidMessage = storage.Documents[0].version;
assert.throws(() => api.updateDocumentProgress({documentId: "doc_1", messageBody: "x".repeat(5001)}), /5000/);
assert.equal(storage.Documents[0].version, versionBeforeInvalidMessage, "An oversized message is rejected before saving the document update");

api.updateDocumentProgress({documentId: "doc_1", stepId: "step_2", status: "Yêu cầu bổ sung", overrideStepStatus: true});
assert.equal(storage.Documents[0].status, "Yêu cầu bổ sung", "An explicit status override remains available");
const priorVersion = storage.Documents[0].version;
assert.throws(() => api.updateDocumentProgress({documentId: "doc_1", stepId: "foreign_step", status: "Sai"}), /không thuộc quy trình/);
assert.equal(storage.Documents[0].version, priorVersion, "A step from another workflow is rejected before document mutation");

const customBody = "<b>Dòng một</b>\nDòng hai";
api.updateDocumentProgress({documentId: "doc_1", stepId: "step_2", status: "Đang xử lý", messageBody: customBody, sendEmail: true});
const lastNotification = storage.Notifications.at(-1);
const queuedEmail = storage.EmailQueue[0];
assert.equal(lastNotification.title, "Bảng điểm");
assert.equal(lastNotification.message, customBody);
assert.equal(queuedEmail.subject, lastNotification.title);
assert.equal(queuedEmail.body, lastNotification.message, "The email and in-app notification share the same custom body");
assert.equal(sentEmails.length, 1);
assert.match(sentEmails[0].htmlBody, /&lt;b&gt;Dòng một&lt;\/b&gt;<br>Dòng hai/, "Email bodies preserve newlines and escape HTML supplied as text");
assert.equal(JSON.parse(lastNotification.i18n_json).customMessage, true, "Custom messages are not translated by the notification view");

const currentStep = storage.Documents[0].current_step_id;
api.batchUpdateDocuments({documentIds: ["doc_1", "doc_2"], status: "Đã hoàn thành", messageBody: customBody});
assert.deepEqual(storage.Notifications.slice(-2).map(item => item.title), ["Bảng điểm", "Bằng tốt nghiệp"]);
assert.deepEqual(storage.Notifications.slice(-2).map(item => item.message), [customBody, customBody]);
assert.equal(storage.Documents[0].current_step_id, currentStep, "Bulk status updates preserve the current processing step");

const mailMerge = "{{ten_sinh_vien}}|{{mssv}}|{{loai_ho_so}}|{{trang_thai}}|{{phan_hoi}}";
api.batchUpdateDocuments({documentIds: ["doc_1", "doc_2"], status: "Đang xử lý", publicNote: "Đã tiếp nhận", messageBody: mailMerge});
assert.equal(storage.Notifications.at(-2).message, "Nguyễn Văn A|52200001|Bảng điểm|Đang xử lý|Đã tiếp nhận");
assert.equal(storage.Notifications.at(-1).message, "Nguyễn Văn A|52200001|Bằng tốt nghiệp|Đang xử lý|Đã tiếp nhận", "Bulk templates resolve separately for each document");
const priorBatchStatuses = storage.Documents.map(row => row.status);
assert.throws(() => api.batchUpdateDocuments({documentIds: ["doc_1", "doc_2"], status: "Đã hoàn thành", messageBody: "{{ten_sinh_vien}} {{ghi_chu_noi_bo}}"}), /ghi_chu_noi_bo/);
assert.deepEqual(storage.Documents.map(row => row.status), priorBatchStatuses, "An invalid variable rejects the whole batch before mutation");

const templates = api.notificationTemplates_();
assert.match(templates.documentProgress.body, /{{ten_sinh_vien}}/);
assert.ok(templates.documentProgress.variables.some(item => item.key === "ma_ho_so"));
const mergeData = api.notificationTemplateData_({student_name: "{{mssv}}", student_id: "52200002"}, {typeName: "Bảng điểm"});
assert.equal(api.renderNotificationTemplate_("{{ten_sinh_vien}}|{{mssv}}|{{ngay_du_kien}}", "documentProgress", mergeData, 5000), "{{mssv}}|52200002|—", "Replacement is one pass and missing optional values use a dash");
assert.throws(() => api.renderNotificationTemplate_("{{noi_dung_trao_doi}}", "documentProgress", mergeData, 5000), /noi_dung_trao_doi/);
assert.throws(() => api.renderNotificationTemplate_("{{ten_sinh_vien}}".repeat(3), "documentProgress", api.notificationTemplateData_({student_name: "A".repeat(1700)}, {}), 5000), /5000/);
const defaultService = api.compileNotificationMessage_(templates.service.body, templates.service.title, "service", {student_name:"Nguyễn Văn A",student_id:"52200001"}, {topic:"Tư vấn",result:"Đã hướng dẫn"}, "Kết quả tiếp sinh viên");
assert.equal(defaultService.bodyIsDefault, true, "The untouched default template remains identifiable for bilingual notifications");
assert.equal(defaultService.titleIsDefault, true);
assert.match(defaultService.body, /^Kính gửi sinh viên Nguyễn Văn A \(MSSV: 52200001\),\n\n/);
assert.match(defaultService.body, /Kết quả xử lý: Đã hướng dẫn\n\nTrân trọng\.$/);
assert.match(defaultService.messageEn, /^Dear Nguyễn Văn A \(Student ID: 52200001\),\n\n/);
assert.match(defaultService.messageEn, /Outcome: Đã hướng dẫn\n\nSincerely,/);
assert.equal(api.compileNotificationMessage_("Nội dung riêng cho {{ten_sinh_vien}}", "", "service", {student_name:"Nguyễn Văn A"}, {}).messageEn, "", "A custom template is never replaced by the default translation");
assert.throws(() => api.compileNotificationMessage_("body", "{{ten_sinh_vien}}".repeat(11), "service", {student_name:"A".repeat(25)}, {}, "Kết quả"), /200/);

const requestStorage = {
  DocumentRequests: [
    {request_id:"req_1",request_code:"YC-001",student_id:"52200001",student_email:"52200001@student.tdtu.edu.vn",student_name:"Nguyễn Văn A",class_name:"K28",type_id:"type_1",type_name:"Bảng điểm",status:"PENDING",version:1,expected_at:"",public_note:"",internal_note:""},
    {request_id:"req_2",request_code:"YC-002",student_id:"52200002",student_email:"52200002@student.tdtu.edu.vn",student_name:"Trần Thị B",class_name:"K29",type_id:"type_2",type_name:"Bằng tốt nghiệp",status:"PENDING",version:1,expected_at:"",public_note:"",internal_note:""},
    {request_id:"req_3",request_code:"YC-003",student_id:"52200003",student_email:"52200003@student.tdtu.edu.vn",student_name:"Lê Văn C",class_name:"K30",type_id:"type_3",type_name:"Giấy xác nhận",status:"PENDING",version:1,expected_at:"",public_note:"",internal_note:""},
  ], DocumentRequestEvents: [], Notifications: [], Documents: [],
};
const transactionStorage = {
  Transactions: [{transaction_id:"tx_1",transaction_code:"GD-001",transaction_type:"OTHER",student_id:"52200001",student_email:"52200001@student.tdtu.edu.vn",student_name:"Nguyễn Văn A",class_name:"K28",status:"PENDING"}],
  TransactionItems: [
    {item_id:"item_1",transaction_id:"tx_1",type_id:"type_1",type_name:"Bảng điểm",status:"PENDING"},
    {item_id:"item_2",transaction_id:"tx_1",type_id:"type_2",type_name:"Bằng tốt nghiệp",status:"PENDING"},
  ], Notifications: [], EmailQueue: [], Documents: [], DocumentEvents: [],
};
api.setStorage(transactionStorage);
assert.throws(() => api.reviewTransactionItems({itemIds:["item_1","item_2"],decision:"APPROVE",messageBody:"{{ghi_chu_noi_bo}}"}), /ghi_chu_noi_bo/);
assert.deepEqual(transactionStorage.TransactionItems.map(row=>row.status), ["PENDING","PENDING"], "Invalid transaction templates fail before reviewing any item");
api.reviewTransactionItems({itemIds:["item_1","item_2"],decision:"APPROVE",note:"Đã đối chiếu",messageBody:"{{ten_sinh_vien}}|{{loai_ho_so}}|{{ma_yeu_cau}}|{{phan_hoi}}",sendEmail:true});
assert.deepEqual(transactionStorage.Notifications.map(row=>row.message), ["Nguyễn Văn A|Bảng điểm|GD-001|Đã đối chiếu","Nguyễn Văn A|Bằng tốt nghiệp|GD-001|Đã đối chiếu"], "Transaction templates merge fields separately for each reviewed document");
assert.deepEqual(transactionStorage.EmailQueue.map(row=>row.body), transactionStorage.Notifications.map(row=>row.message), "Resolved transaction templates are queued for email");

api.setStorage(requestStorage);
assert.throws(() => api.batchUpdateDocumentRequests({requestIds:["req_1","req_2"],versions:{req_1:1,req_2:1},action:"ACCEPT",actionToken:"batch_invalid",messageBody:"{{ten_sinh_vien}} {{ghi_chu_noi_bo}}"}), /ghi_chu_noi_bo/);
assert.deepEqual(requestStorage.DocumentRequests.map(row=>row.status), ["PENDING","PENDING","PENDING"], "Invalid request template validation happens before batch state changes");
api.batchUpdateDocumentRequests({requestIds:["req_1","req_2"],versions:{req_1:1,req_2:1},action:"ACCEPT",actionToken:"batch_valid",publicNote:"Đã tiếp nhận",messageBody:"{{ten_sinh_vien}}|{{loai_ho_so}}|{{trang_thai}}|{{phan_hoi}}"});
assert.deepEqual(requestStorage.Notifications.map(row=>row.message), ["Nguyễn Văn A|Bảng điểm|Đang xử lý|Đã tiếp nhận","Trần Thị B|Bằng tốt nghiệp|Đang xử lý|Đã tiếp nhận"], "Request batch mail merge resolves each student's and request's fields");
api.batchUpdateDocumentRequests({requestIds:["req_3"],versions:{req_3:1},action:"ACCEPT",actionToken:"batch_default",messageBody:templates.request_ACCEPT.body});
assert.equal(requestStorage.Notifications[2].message.includes("Lê Văn C"), true, "Default request templates are substituted before storing notifications");
assert.equal(JSON.parse(requestStorage.Notifications[2].i18n_json).customMessage, false, "Default request templates retain bilingual notification rendering");

const serviceStorage = {
  ServiceSessions: [{
    session_id: "svc_live", student_id: "52200001", student_email: "52200001@student.tdtu.edu.vn",
    student_name: "Nguyễn Văn A", class_name: "K28", document_id: "", recording_type: "LIVE",
    started_at: new Date(Date.now() - 60000), staff_email: "admin@tdtu.edu.vn", status: "RUNNING",
  }],
  Notifications: [], EmailQueue: [],
};
api.setStorage(serviceStorage);
api.finishServiceSession({sessionId: "svc_live", topic: "Tư vấn", result: "Đã hướng dẫn"});
assert.equal(serviceStorage.Notifications.length, 1, "Finishing a live session always creates an in-app notification");
assert.equal(serviceStorage.Notifications[0].title, "Kết quả tiếp sinh viên");
assert.match(serviceStorage.Notifications[0].message, /Nội dung trao đổi: Tư vấn\nKết quả xử lý: Đã hướng dẫn/);
assert.equal(serviceStorage.EmailQueue.length, 0, "Email is optional for service sessions");

api.addManualServiceSession({
  studentId: "52200001", startedAt: "2026-11-18T09:00:00", endedAt: "2026-11-18T09:15:00",
  topic: "Bổ sung giấy tờ", result: "Đã tiếp nhận", messageTitle: "{{ten_sinh_vien}} - Hẹn bổ sung hồ sơ",
  messageBody: customBody, sendEmail: true,
});
assert.equal(serviceStorage.Notifications.length, 2, "A saved manual session always creates an in-app notification");
assert.equal(serviceStorage.Notifications[1].title, "Nguyễn Văn A - Hẹn bổ sung hồ sơ", "Editable email subjects also resolve merge fields");
assert.equal(serviceStorage.Notifications[1].message, customBody);
assert.equal(serviceStorage.EmailQueue[0].subject, "Nguyễn Văn A - Hẹn bổ sung hồ sơ");
assert.equal(serviceStorage.EmailQueue[0].body, customBody);
assert.equal(sentEmails.length, 4);

failNextEmail = true;
api.addManualServiceSession({
  studentId: "52200001", startedAt: "2026-11-18T09:00:00", endedAt: "2026-11-18T09:15:00",
  topic: "Hỏi đáp", result: "Đã trả lời", sendEmail: true,
});
assert.equal(serviceStorage.Notifications.length, 3, "A failed email does not prevent the in-app notification from being saved");
assert.equal(serviceStorage.EmailQueue[1].status, "FAILED");
assert.equal(serviceStorage.EmailQueue[1].attempts, 1);

console.log("Notification and email behavior verification passed");
