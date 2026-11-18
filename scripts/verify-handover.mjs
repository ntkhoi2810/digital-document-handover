import assert from "node:assert/strict";
import fs from "node:fs";

const code = fs.readFileSync("Code.gs", "utf8");
const Utilities = {
  getUuid: () => "12345678-1234-1234-1234-123456789abc",
  formatDate: () => "20261118-120000",
};
const LockService = {getScriptLock: () => ({waitLock() {}, releaseLock() {}})};

const api = new Function("Utilities", "LockService", `${code}
  return {
    normalizeHandoverMode_, typeAllowsTransaction_, createDocumentFromItem_,
    createDirectPickupDocument_, handOverDocument_, getTransactionResult_, ensureSheetSchema_, createTransaction, HEADERS,
    setStorage(storage) {
      readTable_ = name => (storage[name] || []).map((row, index) => ({...row, _row: index + 2}));
      findBy_ = (name, field, value) => readTable_(name).find(row => String(row[field] || '').toLowerCase() === String(value || '').toLowerCase()) || null;
      appendRecord_ = (name, record) => { storage[name] ||= []; storage[name].push({...record}); };
      updateRow_ = (name, rowNumber, patch) => Object.assign(storage[name][rowNumber - 2], patch);
      audit_ = () => {};
      notify_ = () => {};
      assertStudent_ = () => ({email: "52200001@student.tdtu.edu.vn", studentId: "52200001", role: "STUDENT"});
      requireProfile_ = () => ({student_id: "52200001", email: "52200001@student.tdtu.edu.vn", full_name: "Nguyễn Văn A", class_name: "K28"});
    }
  };
`)(Utilities, LockService);

assert.equal(api.normalizeHandoverMode_("receive"), "RECEIVE");
assert.equal(api.normalizeHandoverMode_("invalid"), "BOTH");
assert.equal(api.typeAllowsTransaction_({handover_mode: "SUBMIT"}, "SUBMIT"), true);
assert.equal(api.typeAllowsTransaction_({handover_mode: "SUBMIT"}, "RECEIVE"), false);
assert.equal(api.typeAllowsTransaction_({handover_mode: "BOTH"}, "RECEIVE"), true);

function fakeSheet(initialHeaders) {
  const headers = [...initialHeaders];
  const chain = {setBackground(){return this;},setFontColor(){return this;},setFontWeight(){return this;},setHorizontalAlignment(){return this;},setVerticalAlignment(){return this;}};
  return {
    headers,
    getLastRow: () => 2,
    getRange(row, column, rowCount, columnCount) {
      if (row === 1 && column === 1) return {...chain, getValues: () => [[...headers, ...Array(Math.max(0, columnCount - headers.length)).fill("")].slice(0, columnCount)]};
      return {setValues(values) { values[0].forEach((value, index) => { headers[column - 1 + index] = value; }); return this; }};
    },
    setFrozenRows() {}, setHiddenGridlines() {}, autoResizeColumns() {},
  };
}

const legacyTypeSheet = fakeSheet(api.HEADERS.DocumentTypes.slice(0, -1));
api.ensureSheetSchema_(legacyTypeSheet, "DocumentTypes");
assert.deepEqual(legacyTypeSheet.headers, api.HEADERS.DocumentTypes, "Migration must append the new column without moving old columns");

const storage = {
  DocumentTypes: [{type_id: "pickup", name: "Giấy nhận", workflow_version_id: "", active: true, handover_mode: "RECEIVE"}],
  WorkflowSteps: [], Documents: [], DocumentEvents: [], Transactions: [], TransactionItems: [],
};
api.setStorage(storage);

const now = new Date("2026-11-18T05:00:00.000Z");
const transaction = {
  transaction_id: "tx_1", transaction_code: "GD-1", student_id: "52200001",
  student_email: "52200001@student.tdtu.edu.vn", student_name: "Nguyễn Văn A", class_name: "K28",
  transaction_type: "RECEIVE", status: "PENDING", created_at: now, updated_at: now,
};
const item = {item_id: "item_1", transaction_id: "tx_1", type_id: "pickup", type_name: "Giấy nhận", status: "PENDING"};

const createdRequest = api.createTransaction({transactionType: "RECEIVE", items: [{typeId: "pickup"}], requestToken: "req_receive_1"});
assert.equal(createdRequest.type, "RECEIVE");
assert.equal(createdRequest.items[0].documentId, "", "Catalog pickup requests must not require a pre-created personal document");
assert.throws(
  () => api.createTransaction({transactionType: "SUBMIT", items: [{typeId: "pickup"}], requestToken: "req_submit_invalid"}),
  /không áp dụng/,
  "A receive-only type cannot be submitted"
);

api.createDirectPickupDocument_(transaction, item, "admin@tdtu.edu.vn", now, "");
api.createDirectPickupDocument_(transaction, item, "admin@tdtu.edu.vn", now, "");
assert.equal(storage.Documents.length, 1, "Direct pickup retry must not duplicate documents");
assert.equal(storage.DocumentEvents.length, 1, "Direct pickup retry must not duplicate events");
assert.equal(storage.Documents[0].status, "Đã bàn giao");

storage.Documents.push({
  document_id: "doc_waiting", document_code: "HS-2", student_email: transaction.student_email,
  type_id: "pickup", type_name: "Giấy nhận", status: "Chờ sinh viên đến nhận", storage_status: "AT_OFFICE",
  current_step_id: "", version: 1, active: true,
});
api.handOverDocument_("doc_waiting", "admin@tdtu.edu.vn", "", "evt_handover_item_2");
api.handOverDocument_("doc_waiting", "admin@tdtu.edu.vn", "", "evt_handover_item_2");
assert.equal(storage.Documents[1].status, "Đã bàn giao");
assert.equal(storage.DocumentEvents.filter(event => event.event_id === "evt_handover_item_2").length, 1);

storage.Transactions.push(transaction);
storage.TransactionItems.push(item);
const result = api.getTransactionResult_("tx_1", "", true);
assert.equal(result.items[0].pickupCandidates.length, 0, "Already handed-over documents cannot be offered again");

console.log("Handover behavior verification passed");
