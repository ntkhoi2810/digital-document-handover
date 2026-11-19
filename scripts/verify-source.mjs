import assert from "node:assert/strict";
import fs from "node:fs";

const code = fs.readFileSync("Code.gs", "utf8");
const index = fs.readFileSync("Index.html", "utf8");
const styles = fs.readFileSync("Styles.html", "utf8");
const scriptsHtml = fs.readFileSync("Scripts.html", "utf8");

new Function(code);
new Function(scriptsHtml.replace(/^<script>\s*/, "").replace(/\s*<\/script>\s*$/, ""));

const requiredServerFunctions = [
  "doGet", "getBootstrap", "saveStudentProfile", "createTransaction", "reviewTransactionItem", "reviewTransactionItems",
  "getMyDocuments", "getDocumentDetail", "updateDocumentProgress", "batchUpdateDocuments",
  "createManualDocument", "deleteDocumentType", "startServiceSession", "finishServiceSession", "getReport", "setupSystem", "healthCheck",
];
for (const name of requiredServerFunctions) assert.match(code, new RegExp(`function\\s+${name}\\s*\\(`), `Missing ${name}`);

const requiredViews = [
  "student-home", "student-transaction", "student-documents", "student-history", "student-notifications", "student-profile",
  "admin-home", "admin-pending", "admin-documents", "admin-catalog", "admin-service", "admin-students", "admin-reports", "admin-settings",
];
for (const id of requiredViews) assert.match(index, new RegExp(`id=["']${id}["']`), `Missing view ${id}`);

const ids = [...index.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, "Duplicate HTML ids detected");
assert.match(styles, /@media\(max-width:760px\)/, "Missing mobile layout");
assert.match(styles, /timeline-step/, "Missing timeline styling");
assert.match(scriptsHtml, /deleteDocumentType/, "Missing delete document type action");

const helpers = new Function(`${code}\nreturn {isStudentEmail_, extractStudentId_, sanitizeText_, sanitizeId_, toBoolean_};`)();
assert.equal(helpers.isStudentEmail_("52200001@student.tdtu.edu.vn"), true);
assert.equal(helpers.isStudentEmail_("nguyenthaikhoi@tdtu.edu.vn"), false);
assert.equal(helpers.isStudentEmail_("52200001@gmail.com"), false);
assert.equal(helpers.extractStudentId_("52200001@student.tdtu.edu.vn"), "52200001");
assert.equal(helpers.extractStudentId_("student.name@student.tdtu.edu.vn"), "");
assert.equal(helpers.sanitizeId_("doc_abc-123"), "doc_abc-123");
assert.equal(helpers.sanitizeId_("../bad"), "");
assert.equal(helpers.sanitizeText_("  Xin\n chào  ", 20), "Xin chào");
assert.equal(helpers.toBoolean_("TRUE"), true);
assert.match(code, /handover_mode/, "Missing handover mode schema");
assert.match(code, /SCHEMA_VERSION[^\n]*5/, "Missing schema version 5 migration");
assert.match(code, /i18n_json/, "Notification translation metadata must be stored");
assert.match(code, /function\s+ensureDefaultSettings_\s*\(/, "Missing default settings initialization");
assert.doesNotMatch(code, /function\s+seedIfEmpty_\s*\(/, "Runtime must not recreate sample catalog data");
assert.doesNotMatch(code, /Bằng tốt nghiệp|Bảng điểm/, "Runtime must not contain sample document types");
assert.match(code, /NAME:\s*'Sổ giao nhận hồ sơ'/, "App default name must be Sổ giao nhận hồ sơ");
assert.match(index, /<strong id="brand-title">Sổ giao nhận hồ sơ<\/strong>/, "Sidebar brand title must be Sổ giao nhận hồ sơ");
assert.doesNotMatch(index, /·/, "Index.html must not contain middle dot separators");
assert.doesNotMatch(scriptsHtml, /·/, "Scripts.html must not contain middle dot separators");
assert.match(styles, /\.meta-tag/, "Missing catalog meta-tag styling");
assert.match(styles, /\.kpi\.kpi-act/, "Missing semantic KPI color styling");
assert.match(index, /id="language-trigger" class="language-trigger"/, "Missing visible language selector");
assert.match(index, /id="language-menu" class="language-menu hidden" role="listbox"/, "Missing accessible language options menu");
assert.match(scriptsHtml, /function\s+openLanguageMenu\(/, "Missing keyboard-accessible language menu behavior");
assert.match(scriptsHtml, /requestWaiting/, "Missing bilingual system notification translation");
assert.match(scriptsHtml, /data-i18n-vi/, "Dynamic catalog labels must retain both languages");

console.log("Source verification passed");
