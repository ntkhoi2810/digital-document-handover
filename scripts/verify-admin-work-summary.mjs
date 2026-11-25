import assert from "node:assert/strict";
import fs from "node:fs";

const code = fs.readFileSync("Code.gs", "utf8");
const api = new Function(`${code}
  return {
    getAdminWorkSummary,
    setTables(tables, role = "ADMIN") {
      readTable_ = name => tables[name] || [];
      assertAdmin_ = () => {
        if (role !== "ADMIN") throw new Error("ADMIN_ONLY|Admin access required");
      };
    }
  };
`)();

const tables = {
  DocumentTypes: [
    {type_id:"transcript",name:"Bảng điểm",name_en:"Transcript"},
    {type_id:"enrollment",name:"Giấy xác nhận",name_en:"Enrollment Letter"},
  ],
  WorkflowSteps: [
    {workflow_version_id:"wf_custom",status_label:"Đang trình duyệt",status_label_en:"Under Approval"},
  ],
  DocumentRequests: [
    {request_id:"req_pending",request_code:"YC001",type_id:"transcript",type_name:"Bảng điểm",student_name:"Nguyễn An",student_id:"52200001",class_name:"K28",copy_count:2,status:"PENDING",created_at:"2026-11-20T10:00:00Z",expected_at:"2026-11-28T00:00:00Z",document_id:"doc_request_req_pending"},
    {request_id:"req_processing",request_code:"YC002",type_id:"transcript",type_name:"Bảng điểm",student_name:"Trần Bình",student_id:"52200002",class_name:"K28",copy_count:1,status:"PROCESSING",created_at:"2026-11-21T10:00:00Z",document_id:"doc_linked_processing"},
    {request_id:"req_ready",request_code:"YC003",type_id:"enrollment",type_name:"Giấy xác nhận",student_name:"Lê Chi",student_id:"52200003",class_name:"K28",status:"READY",created_at:"2026-11-22T10:00:00Z",document_id:"doc_ready"},
  ],
  Transactions: [
    {transaction_id:"tx_partial",transaction_code:"GD001",transaction_type:"SUBMIT",status:"PARTIAL",student_name:"Phạm Dũng",student_id:"52200004",class_name:"K28",created_at:"2026-11-23T10:00:00Z"},
    {transaction_id:"tx_supplement",transaction_code:"GD002",transaction_type:"SUPPLEMENT",status:"PENDING",student_name:"Hoàng Hà",student_id:"52200005",class_name:"K28",created_at:"2026-11-24T10:00:00Z"},
    {transaction_id:"tx_closed",transaction_code:"GD003",transaction_type:"SUBMIT",status:"COMPLETED",student_name:"Đỗ Khoa",student_id:"52200006",class_name:"K28",created_at:"2026-11-25T10:00:00Z"},
  ],
  TransactionItems: [
    {item_id:"item_pending",transaction_id:"tx_partial",type_id:"transcript",type_name:"Bảng điểm",status:"PENDING"},
    {item_id:"item_approved",transaction_id:"tx_partial",type_id:"enrollment",type_name:"Giấy xác nhận",status:"APPROVED"},
    {item_id:"item_supplement",transaction_id:"tx_supplement",type_id:"enrollment",type_name:"Giấy xác nhận",related_document_id:"doc_supplement",status:"PENDING"},
    {item_id:"item_closed",transaction_id:"tx_closed",type_id:"enrollment",type_name:"Giấy xác nhận",status:"PENDING"},
  ],
  Documents: [
    {document_id:"doc_request_req_pending",request_id:"req_pending",type_id:"transcript",type_name:"Bảng điểm",student_name:"Nguyễn An",student_id:"52200001",class_name:"K28",document_code:"HS001",status:"Chờ sinh viên đến nhận",active:true},
    {document_id:"doc_linked_processing",request_id:"req_processing",type_id:"transcript",type_name:"Bảng điểm",student_name:"Trần Bình",student_id:"52200002",class_name:"K28",document_code:"HS002",status:"Đang xử lý",active:true},
    {document_id:"doc_ready",request_id:"req_ready",type_id:"enrollment",type_name:"Giấy xác nhận",student_name:"Lê Chi",student_id:"52200003",class_name:"K28",document_code:"HS003",status:"Chờ sinh viên đến nhận",active:true},
    {document_id:"doc_intake",type_id:"enrollment",type_name:"Giấy xác nhận",student_name:"Vũ Lan",student_id:"52200007",class_name:"K28",document_code:"HS004",status:"Đã tiếp nhận",active:true,submitted_at:"2026-11-19T10:00:00Z"},
    {document_id:"doc_progress",type_id:"transcript",type_name:"Bảng điểm",student_name:"Ngô Minh",student_id:"52200008",class_name:"K28",document_code:"HS005",workflow_version_id:"wf_custom",status:"Đang trình duyệt",active:true,submitted_at:"2026-11-18T10:00:00Z"},
    {document_id:"doc_supplement",type_id:"enrollment",type_name:"Giấy xác nhận",student_name:"Hoàng Hà",student_id:"52200005",class_name:"K28",document_code:"HS006",status:"Yêu cầu bổ sung",active:true},
    {document_id:"doc_pickup",type_id:"enrollment",type_name:"Giấy xác nhận",student_name:"Đang chờ",student_id:"52200009",class_name:"K28",document_code:"HS007",status:"Chờ sinh viên đến nhận",active:true},
    {document_id:"doc_complete",type_id:"enrollment",type_name:"Giấy xác nhận",student_name:"Đã xong",student_id:"52200010",class_name:"K28",document_code:"HS008",status:"Đã hoàn thành",active:true},
    {document_id:"doc_inactive",type_id:"enrollment",type_name:"Giấy xác nhận",student_name:"Ngừng hoạt động",student_id:"52200011",class_name:"K28",document_code:"HS009",status:"Đang xử lý",active:false},
  ],
};

api.setTables(tables);
const summary = api.getAdminWorkSummary();
assert.equal(summary.pendingCount, 4, "Pending counts include requests, pending transaction items, and intake documents");
assert.equal(summary.processingCount, 2, "Processing counts include accepted requests and active documents");
assert.equal(summary.groups[0].typeId, "transcript", "Groups prioritize types with the most pending work");

const transcript = summary.groups.find(group => group.typeId === "transcript");
assert.equal(transcript.pendingCount, 2);
assert.equal(transcript.processingCount, 2);
assert.equal(transcript.items.find(item => item.code === "YC001").copyCount, 2);
assert.equal(transcript.items.find(item => item.code === "HS005").statusEn, "Under Approval", "Custom workflow status labels keep their English translation");
assert.equal(transcript.items.some(item => item.code === "HS001" || item.code === "HS002"), false, "Linked documents are not counted twice");

const enrollment = summary.groups.find(group => group.typeId === "enrollment");
assert.equal(enrollment.pendingCount, 2, "Only the pending supplement item and newly received document need action");
assert.equal(enrollment.items.some(item => ["YC003", "HS003", "HS006", "HS007", "HS008", "HS009"].includes(item.code)), false, "Ready, supplement-waiting, closed, and inactive work is excluded");

api.setTables(tables, "STUDENT");
assert.throws(() => api.getAdminWorkSummary(), /ADMIN_ONLY/, "Student accounts cannot access admin work summaries");

console.log("Admin work summary verification passed");
