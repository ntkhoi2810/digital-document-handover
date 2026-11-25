import assert from "node:assert/strict";
import fs from "node:fs";

const code = fs.readFileSync("Code.gs", "utf8");
const triggerList = [];
const scriptProperties = new Map();
const sentEmails = [];
let currentDay = "2026-11-25";
let failNextEmail = false;

const ScriptApp = {
  getProjectTriggers: () => [...triggerList],
  deleteTrigger: trigger => triggerList.splice(triggerList.indexOf(trigger), 1),
  newTrigger(handler) {
    const trigger = {handler, id:"trigger-1", getHandlerFunction() { return this.handler; }};
    const builder = {
      timeBased() { return this; },
      atHour(hour) { trigger.hour = hour; return this; },
      nearMinute(minute) { trigger.minute = minute; return this; },
      everyDays(days) { trigger.days = days; return this; },
      inTimezone(timezone) { trigger.timezone = timezone; return this; },
      create() { triggerList.push(trigger); return {getUniqueId:() => trigger.id}; },
    };
    return builder;
  },
};
const PropertiesService = {getScriptProperties: () => ({
  getProperty: key => scriptProperties.get(key) || null,
  setProperty: (key, value) => scriptProperties.set(key, String(value)),
})};
const Utilities = {
  getUuid: () => "12345678-1234-1234-1234-123456789abc",
  formatDate: (_date, _timezone, pattern) => pattern === "yyyy-MM-dd" ? currentDay : "25/11/2026",
};
const LockService = {getScriptLock: () => ({waitLock() {}, releaseLock() {}})};
const MailApp = {sendEmail: email => {
  if (failNextEmail) {
    failNextEmail = false;
    throw new Error("Simulated delivery failure");
  }
  sentEmails.push(email);
}};
const api = new Function("ScriptApp", "PropertiesService", "Utilities", "LockService", "MailApp", `${code}
  return {
    APP, installAdminWorkSummaryReminder, sendAdminWorkSummaryReminder,
    setTables(tables) {
      readTable_ = name => tables[name] || [];
      assertAdmin_ = () => ({email:APP.DEFAULT_ADMIN,role:"ADMIN"});
    }
  };
`)(ScriptApp, PropertiesService, Utilities, LockService, MailApp);

const tables = {
  DocumentTypes:[{type_id:"transcript",name:"Bảng điểm",name_en:"Transcript"}],
  DocumentRequests:[{request_id:"req-1",request_code:"YC001",type_id:"transcript",type_name:"Bảng điểm",student_name:"Nguyễn An",student_id:"52200001",class_name:"K28",copy_count:2,status:"PENDING",created_at:"2026-11-25T01:00:00Z",expected_at:"2026-11-28T00:00:00Z"}],
  Transactions:[], TransactionItems:[], Documents:[], WorkflowSteps:[],
};
api.setTables(tables);

triggerList.push(
  {handler:"otherHandler",id:"unrelated",getHandlerFunction() { return this.handler; }},
  {handler:"sendAdminWorkSummaryReminder",id:"old-trigger",getHandlerFunction() { return this.handler; }}
);
api.installAdminWorkSummaryReminder();
api.installAdminWorkSummaryReminder();
const reminderTriggers = triggerList.filter(trigger => trigger.handler === "sendAdminWorkSummaryReminder");
assert.equal(reminderTriggers.length, 1, "Repeated setup leaves one reminder trigger");
assert.deepEqual({hour:reminderTriggers[0].hour,minute:reminderTriggers[0].minute,days:reminderTriggers[0].days,timezone:reminderTriggers[0].timezone}, {hour:7,minute:30,days:1,timezone:"Asia/Ho_Chi_Minh"});
assert.equal(scriptProperties.get("ADMIN_WORK_SUMMARY_TRIGGER_UID"), "trigger-1");

assert.throws(() => api.sendAdminWorkSummaryReminder(), /TRIGGER_ONLY/, "Direct calls cannot send the owner reminder");
const event = {triggerUid:"trigger-1"};
const firstSend = api.sendAdminWorkSummaryReminder(event);
assert.equal(firstSend.sent, true);
assert.equal(sentEmails.length, 1);
assert.equal(sentEmails[0].to, "nguyenthaikhoi@tdtu.edu.vn");
assert.match(sentEmails[0].subject, /25\/11\/2026/);
assert.match(sentEmails[0].body, /YC001/);
assert.match(sentEmails[0].htmlBody, /Nguyễn An/);
assert.equal(api.sendAdminWorkSummaryReminder(event).reason, "ALREADY_SENT");
assert.equal(sentEmails.length, 1, "A second run on the same day is skipped");

currentDay = "2026-11-26";
failNextEmail = true;
assert.throws(() => api.sendAdminWorkSummaryReminder(event), /Simulated delivery failure/);
assert.equal(scriptProperties.get("ADMIN_WORK_SUMMARY_LAST_SENT_DATE"), "2026-11-25", "Failed delivery does not mark the next day as sent");
assert.equal(api.sendAdminWorkSummaryReminder(event).sent, true, "A failed delivery can be retried");

currentDay = "2026-11-27";
api.setTables({DocumentTypes:[],DocumentRequests:[],Transactions:[],TransactionItems:[],Documents:[],WorkflowSteps:[]});
assert.equal(api.sendAdminWorkSummaryReminder(event).sent, true);
assert.match(sentEmails.at(-1).body, /Cần xử lý: 0/);
assert.match(sentEmails.at(-1).body, /Hiện không có hồ sơ/);

console.log("Admin work reminder verification passed");
