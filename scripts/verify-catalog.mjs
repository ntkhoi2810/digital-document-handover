import assert from "node:assert/strict";
import fs from "node:fs";

const code = fs.readFileSync("Code.gs", "utf8");
const LockService = {getScriptLock: () => ({waitLock() {}, releaseLock() {}})};

const api = new Function("LockService", `${code}
  let storage = {};
  let audits = [];
  return {
    deleteDocumentType,
    setStorage(nextStorage) {
      storage = nextStorage;
      audits = [];
      readTable_ = name => (storage[name] || []).map((row, index) => ({...row, _row: index + 2}));
      findBy_ = (name, field, value) => readTable_(name).find(row => String(row[field] || '').toLowerCase() === String(value || '').toLowerCase()) || null;
      deleteRow_ = (name, rowNumber) => storage[name].splice(rowNumber - 2, 1);
      audit_ = (action, entityType, entityId, actor, detail) => audits.push({action, entityType, entityId, actor, detail});
      assertAdmin_ = () => ({email: "admin@tdtu.edu.vn", role: "ADMIN"});
    },
    getAudits: () => audits,
  };
`)(LockService);

const unusedStorage = {
  DocumentTypes: [{type_id: "type_unused", name: "Loại chưa dùng"}],
  Documents: [],
  TransactionItems: [],
};
api.setStorage(unusedStorage);
assert.deepEqual(api.deleteDocumentType("type_unused"), {ok: true});
assert.equal(unusedStorage.DocumentTypes.length, 0, "An unused document type must be deleted");
assert.equal(api.getAudits()[0].action, "DELETE_DOCUMENT_TYPE", "Deletion must be audited");

const usedByDocument = {
  DocumentTypes: [{type_id: "type_used", name: "Loại đã dùng"}],
  Documents: [{document_id: "doc_1", type_id: "type_used"}],
  TransactionItems: [],
};
api.setStorage(usedByDocument);
assert.throws(() => api.deleteDocumentType("type_used"), /không thể xoá/);
assert.equal(usedByDocument.DocumentTypes.length, 1, "A referenced document type must be preserved");

const usedByTransaction = {
  DocumentTypes: [{type_id: "type_pending", name: "Loại trong giao dịch"}],
  Documents: [],
  TransactionItems: [{item_id: "item_1", type_id: "type_pending"}],
};
api.setStorage(usedByTransaction);
assert.throws(() => api.deleteDocumentType("type_pending"), /không thể xoá/);
assert.equal(usedByTransaction.DocumentTypes.length, 1, "A type referenced by a transaction must be preserved");

console.log("Catalog deletion verification passed");
