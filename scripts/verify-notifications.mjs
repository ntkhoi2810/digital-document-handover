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
    workflow_version_id: "wf_1", current_step_id: "step_1", current_step_order: 1,
    student_email: "52200001@student.tdtu.edu.vn", status: "Đã tiếp nhận", version: 1,
    active: true, public_note: "", internal_note: "Không gửi ghi chú nội bộ",
  }, {
    document_id: "doc_2", document_code: "HS-2026-002", type_id: "type_2", type_name: "Bằng tốt nghiệp",
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
  topic: "Bổ sung giấy tờ", result: "Đã tiếp nhận", messageTitle: "Hẹn bổ sung hồ sơ",
  messageBody: customBody, sendEmail: true,
});
assert.equal(serviceStorage.Notifications.length, 2, "A saved manual session always creates an in-app notification");
assert.equal(serviceStorage.Notifications[1].title, "Hẹn bổ sung hồ sơ");
assert.equal(serviceStorage.Notifications[1].message, customBody);
assert.equal(serviceStorage.EmailQueue[0].subject, "Hẹn bổ sung hồ sơ");
assert.equal(serviceStorage.EmailQueue[0].body, customBody);
assert.equal(sentEmails.length, 2);

failNextEmail = true;
api.addManualServiceSession({
  studentId: "52200001", startedAt: "2026-11-18T09:00:00", endedAt: "2026-11-18T09:15:00",
  topic: "Hỏi đáp", result: "Đã trả lời", sendEmail: true,
});
assert.equal(serviceStorage.Notifications.length, 3, "A failed email does not prevent the in-app notification from being saved");
assert.equal(serviceStorage.EmailQueue[1].status, "FAILED");
assert.equal(serviceStorage.EmailQueue[1].attempts, 1);

console.log("Notification and email behavior verification passed");
