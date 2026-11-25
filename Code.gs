const APP = Object.freeze({
  NAME: 'Sổ giao nhận hồ sơ',
  SPREADSHEET_ID: '1iQjaNfuHtqrN-d2LI7cSJGThOcWbxn-TE7tIGwtaHas',
  STUDENT_DOMAIN: 'student.tdtu.edu.vn',
  DEFAULT_ADMIN: 'nguyenthaikhoi@tdtu.edu.vn',
  TIMEZONE: 'Asia/Ho_Chi_Minh',
  SHEETS: Object.freeze({
    SETTINGS: 'Settings',
    ADMINS: 'Admins',
    STUDENTS: 'Students',
    TYPES: 'DocumentTypes',
    WORKFLOW_VERSIONS: 'WorkflowVersions',
    WORKFLOW_STEPS: 'WorkflowSteps',
    DOCUMENTS: 'Documents',
    EVENTS: 'DocumentEvents',
    REQUESTS: 'DocumentRequests',
    REQUEST_EVENTS: 'DocumentRequestEvents',
    TRANSACTIONS: 'Transactions',
    ITEMS: 'TransactionItems',
    SERVICES: 'ServiceSessions',
    NOTIFICATIONS: 'Notifications',
    EMAIL_QUEUE: 'EmailQueue',
    AUDIT: 'AuditLog'
  })
});

const HEADERS = Object.freeze({
  Settings: ['key', 'value', 'description', 'updated_at', 'updated_by'],
  Admins: ['email', 'name', 'role', 'active', 'created_at', 'updated_at'],
  Students: ['student_id', 'email', 'full_name', 'class_name', 'active', 'created_at', 'updated_at', 'updated_by'],
  DocumentTypes: ['type_id', 'name', 'description', 'tracks_progress', 'workflow_version_id', 'active', 'sort_order', 'created_at', 'updated_at', 'handover_mode', 'name_en', 'description_en', 'request_enabled'],
  WorkflowVersions: ['workflow_version_id', 'name', 'version', 'active', 'created_at', 'created_by', 'name_en'],
  WorkflowSteps: ['step_id', 'workflow_version_id', 'step_order', 'name', 'status_label', 'created_at', 'name_en', 'status_label_en'],
  Documents: ['document_id', 'document_code', 'student_id', 'student_email', 'student_name', 'class_name', 'type_id', 'type_name', 'workflow_version_id', 'current_step_id', 'current_step_order', 'status', 'storage_status', 'submitted_at', 'expected_at', 'updated_at', 'updated_by', 'public_note', 'internal_note', 'version', 'active', 'request_id'],
  DocumentEvents: ['event_id', 'document_id', 'event_type', 'from_step_id', 'to_step_id', 'status', 'public_note', 'internal_note', 'created_at', 'created_by'],
  DocumentRequests: ['request_id', 'request_code', 'student_id', 'student_email', 'student_name', 'class_name', 'type_id', 'type_name', 'purpose', 'copy_count', 'student_note', 'status', 'expected_at', 'public_note', 'internal_note', 'document_id', 'created_at', 'updated_at', 'updated_by', 'version', 'request_token'],
  DocumentRequestEvents: ['event_id', 'request_id', 'event_type', 'from_status', 'to_status', 'public_note', 'internal_note', 'created_at', 'created_by', 'action_token'],
  Transactions: ['transaction_id', 'transaction_code', 'student_id', 'student_email', 'student_name', 'class_name', 'transaction_type', 'status', 'student_note', 'request_token', 'created_at', 'updated_at', 'reviewed_by'],
  TransactionItems: ['item_id', 'transaction_id', 'type_id', 'type_name', 'document_id', 'related_document_id', 'status', 'admin_note', 'created_at', 'reviewed_at', 'reviewed_by'],
  ServiceSessions: ['session_id', 'student_id', 'student_email', 'student_name', 'class_name', 'document_id', 'recording_type', 'started_at', 'ended_at', 'duration_minutes', 'topic', 'result', 'staff_email', 'note', 'status', 'created_at', 'updated_at'],
  Notifications: ['notification_id', 'student_email', 'document_id', 'title', 'message', 'read', 'created_at', 'created_by', 'i18n_json', 'request_id'],
  EmailQueue: ['email_id', 'recipient', 'subject', 'body', 'status', 'attempts', 'last_error', 'created_at', 'sent_at'],
  AuditLog: ['audit_id', 'action', 'entity_type', 'entity_id', 'actor_email', 'detail_json', 'created_at']
});

const CACHE_TTL_SECONDS = 300;
const INIT_CACHE_TTL_SECONDS = 21600;
const INIT_VERSION_KEY = 'SCHEMA_INIT_V5';
const CACHED_SHEETS = Object.freeze({
  Settings: true,
  Admins: true,
  DocumentTypes: true,
  WorkflowVersions: true,
  WorkflowSteps: true
});
const runtimeCache_ = {
  initState: '',
  spreadsheetId: '',
  spreadsheet: null,
  sheets: {},
  tables: {},
  identity: null
};

function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  template.initialView = sanitizeText_((e && e.parameter && e.parameter.view) || '', 40);
  return template.evaluate()
    .setTitle(APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getBootstrap() {
  ensureSystemInitialized_();
  const identity = getIdentity_();
  const settings = getSettings_();
  const types = readTable_(APP.SHEETS.TYPES).filter(function(row) { return toBoolean_(row.active); })
    .sort(function(a, b) { return Number(a.sort_order || 0) - Number(b.sort_order || 0); });
  const rawAppName = settings.APP_NAME || APP.NAME;
  const appName = ['Hệ thống Giao nhận Hồ sơ Sinh viên', 'Giao nhận hồ sơ'].indexOf(rawAppName) !== -1 ? APP.NAME : rawAppName;
  const response = {
    appName: appName,
    officeName: settings.OFFICE_NAME || 'Văn phòng Khoa',
    identity: identity,
    profile: null,
    types: types.map(publicType_),
    requestTypes: types.filter(function(row) { return toBoolean_(row.request_enabled) && ['RECEIVE', 'BOTH'].indexOf(normalizeHandoverMode_(row.handover_mode || 'BOTH')) !== -1; }).map(publicType_),
    serverTime: iso_(new Date())
  };

  if (identity.role === 'STUDENT') {
    const profile = findBy_(APP.SHEETS.STUDENTS, 'email', identity.email);
    const studentDocs = getStudentDocumentsRaw_(identity.email);
    response.profile = profile ? publicStudent_(profile) : null;
    response.dashboard = getStudentDashboard_(identity.email, studentDocs);
    response.documents = studentDocs.map(publicDocument_);
  } else {
    response.notificationTemplates = notificationTemplates_();
    response.profile = { email: identity.email, fullName: identity.name || '' };
    response.dashboard = getAdminDashboard_();
    response.pendingTransactions = listPendingTransactions_();
  }
  return response;
}

function notificationTemplates_() {
  const common = ['ten_sinh_vien', 'mssv', 'email_sinh_vien', 'lop'];
  const variables = {
    ten_sinh_vien: 'Họ tên sinh viên', mssv: 'Mã số sinh viên', email_sinh_vien: 'Email sinh viên', lop: 'Lớp',
    loai_ho_so: 'Loại hồ sơ', ma_ho_so: 'Mã hồ sơ', ma_yeu_cau: 'Mã yêu cầu', trang_thai: 'Trạng thái',
    ngay_du_kien: 'Ngày dự kiến', quy_trinh: 'Quy trình', buoc_xu_ly: 'Bước xử lý', phan_hoi: 'Phản hồi công khai',
    noi_dung_trao_doi: 'Nội dung trao đổi', ket_qua_xu_ly: 'Kết quả xử lý'
  };
  const make = function(linesVi, linesEn, keys, title, titleEn) {
    return {
      body: ['Thân gửi sinh viên {{ten_sinh_vien}} (MSSV: {{mssv}}),', '', ...linesVi, '', 'Trân trọng.'].join('\n'),
      bodyEn: ['Dear {{ten_sinh_vien}} (Student ID: {{mssv}}),', '', ...linesEn, '', 'Sincerely,\nFaculty Office'].join('\n'),
      title: title || '', titleEn: titleEn || '',
      variables: keys.map(function(key) { return { key: key, label: variables[key] }; })
    };
  };
  const documentKeys = common.concat(['loai_ho_so', 'ma_ho_so', 'trang_thai', 'ngay_du_kien', 'quy_trinh', 'buoc_xu_ly', 'phan_hoi']);
  const documentTemplate = function(introVi, introEn) {
    return make(
      [introVi, '', 'Trạng thái: {{trang_thai}}', 'Ngày dự kiến hoàn thành: {{ngay_du_kien}}', 'Quy trình: {{quy_trinh}}', 'Bước xử lý: {{buoc_xu_ly}}', 'Phản hồi của Văn phòng Khoa: {{phan_hoi}}'],
      [introEn, '', 'Status: {{trang_thai}}', 'Expected completion date: {{ngay_du_kien}}', 'Workflow: {{quy_trinh}}', 'Processing step: {{buoc_xu_ly}}', 'Faculty Office response: {{phan_hoi}}'],
      documentKeys
    );
  };
  const reviewKeys = common.concat(['loai_ho_so', 'ma_ho_so', 'ma_yeu_cau', 'phan_hoi']);
  const requestKeys = common.concat(['loai_ho_so', 'ma_yeu_cau', 'ma_ho_so', 'trang_thai', 'ngay_du_kien', 'phan_hoi']);
  const requestTemplate = function(introVi, introEn, instructionVi, instructionEn) {
    const vi = [introVi, '', 'Mã yêu cầu: {{ma_yeu_cau}}', 'Loại hồ sơ: {{loai_ho_so}}', 'Mã hồ sơ: {{ma_ho_so}}', 'Trạng thái: {{trang_thai}}', 'Ngày dự kiến: {{ngay_du_kien}}', 'Phản hồi của Văn phòng Khoa: {{phan_hoi}}'];
    const en = [introEn, '', 'Request ID: {{ma_yeu_cau}}', 'Document type: {{loai_ho_so}}', 'Document ID: {{ma_ho_so}}', 'Status: {{trang_thai}}', 'Expected date: {{ngay_du_kien}}', 'Faculty Office response: {{phan_hoi}}'];
    if (instructionVi) {
      vi.push('', instructionVi);
      en.push('', instructionEn);
    }
    return make(vi, en, requestKeys);
  };
  const progress = documentTemplate(
    'Văn phòng Khoa thông báo kết quả cập nhật tiến độ xử lý hồ sơ {{loai_ho_so}} (mã hồ sơ: {{ma_ho_so}}).',
    'The Faculty Office is writing to provide an update on the processing of {{loai_ho_so}} (document ID: {{ma_ho_so}}).'
  );
  return {
    documentCreated: documentTemplate(
      'Văn phòng Khoa đã ghi nhận hồ sơ {{loai_ho_so}} (mã hồ sơ: {{ma_ho_so}}) vào hệ thống. Thông tin xử lý như sau.',
      'The Faculty Office has registered {{loai_ho_so}} (document ID: {{ma_ho_so}}) in the system. Processing details are provided below.'
    ),
    documentProgress: progress,
    documentBatch: progress,
    documentCancel: make(
      ['Văn phòng Khoa thông báo hồ sơ {{loai_ho_so}} (mã hồ sơ: {{ma_ho_so}}) đã được hủy trên hệ thống.', '', 'Lý do: {{phan_hoi}}'],
      ['The Faculty Office is writing to inform you that {{loai_ho_so}} (document ID: {{ma_ho_so}}) has been cancelled in the system.', '', 'Reason: {{phan_hoi}}'],
      common.concat(['loai_ho_so', 'ma_ho_so', 'trang_thai', 'phan_hoi'])
    ),
    transactionApprove: make(
      ['Văn phòng Khoa đã đối chiếu và xác nhận giấy tờ thuộc loại hồ sơ {{loai_ho_so}} tại quầy.', '', 'Mã yêu cầu: {{ma_yeu_cau}}', 'Phản hồi của Văn phòng Khoa: {{phan_hoi}}'],
      ['The Faculty Office has verified and confirmed the paperwork for {{loai_ho_so}} at the service counter.', '', 'Request ID: {{ma_yeu_cau}}', 'Faculty Office response: {{phan_hoi}}'],
      reviewKeys
    ),
    transactionReject: make(
      ['Sau khi đối chiếu, Văn phòng Khoa chưa thể xác nhận giấy tờ thuộc loại hồ sơ {{loai_ho_so}}.', '', 'Mã yêu cầu: {{ma_yeu_cau}}', 'Lý do: {{phan_hoi}}'],
      ['After reviewing your paperwork for {{loai_ho_so}}, the Faculty Office was unable to confirm it.', '', 'Request ID: {{ma_yeu_cau}}', 'Reason: {{phan_hoi}}'],
      reviewKeys
    ),
    request_ACCEPT: requestTemplate('Văn phòng Khoa đã tiếp nhận yêu cầu cấp hồ sơ và đang tiến hành xử lý.', 'The Faculty Office has received your document request and is processing it.'),
    request_READY: requestTemplate('Văn phòng Khoa thông báo hồ sơ theo yêu cầu đã được chuẩn bị và sẵn sàng bàn giao.', 'The Faculty Office has prepared the requested document and it is ready for collection.', 'Đề nghị sinh viên đến Văn phòng Khoa để nhận hồ sơ.', 'Please visit the Faculty Office to collect your document.'),
    request_COMPLETE: requestTemplate('Văn phòng Khoa xác nhận hồ sơ theo yêu cầu đã được bàn giao cho sinh viên.', 'The Faculty Office confirms that the requested document has been handed over to you.'),
    request_REJECT: requestTemplate('Sau khi xem xét, Văn phòng Khoa chưa thể chấp thuận yêu cầu cấp hồ sơ.', 'After reviewing your document request, the Faculty Office was unable to approve it.'),
    request_CANCEL: requestTemplate('Văn phòng Khoa thông báo yêu cầu cấp hồ sơ đã được hủy trên hệ thống.', 'The Faculty Office is writing to inform you that your document request has been cancelled in the system.'),
    request_UPDATE: requestTemplate('Văn phòng Khoa thông báo thông tin xử lý yêu cầu cấp hồ sơ đã được cập nhật.', 'The Faculty Office is writing to inform you that the processing details for your document request have been updated.'),
    service: make(
      ['Văn phòng Khoa thông báo nội dung và kết quả xử lý sau buổi tiếp sinh viên như sau.', '', 'Nội dung trao đổi: {{noi_dung_trao_doi}}', 'Kết quả xử lý: {{ket_qua_xu_ly}}'],
      ['The Faculty Office is writing to summarize the discussion and outcome of your appointment.', '', 'Discussion: {{noi_dung_trao_doi}}', 'Outcome: {{ket_qua_xu_ly}}'],
      common.concat(['noi_dung_trao_doi', 'ket_qua_xu_ly']), 'Thông báo kết quả buổi tiếp sinh viên', 'Outcome of your student services appointment'
    )
  };
}

function renderNotificationTemplate_(text, templateKey, data, maxLength) {
  const templates = notificationTemplates_();
  const template = templates[templateKey];
  if (!template) throw new Error('VALIDATION|Không tìm thấy mẫu thông báo ' + templateKey + '.');
  const allowed = new Set(template.variables.map(function(item) { return item.key; }));
  const value = String(text == null ? '' : text);
  if (/{{|}}/.test(value.replace(/{{[^{}]+}}/g, ''))) {
    const malformed = value.replace(/{{[^{}]+}}/g, '').match(/{{[^{}]*}}|}}|{{/);
    throw new Error('VALIDATION|Cú pháp biến không hợp lệ: ' + (malformed ? malformed[0] : '') + '.');
  }
  const output = value.replace(/{{([^{}]+)}}/g, function(match, name) {
    if (!allowed.has(name)) throw new Error('VALIDATION|Biến không hợp lệ hoặc không dùng được trong mẫu này: {{' + name + '}}.');
    return Object.prototype.hasOwnProperty.call(data || {}, name) && data[name] !== '' && data[name] != null ? String(data[name]) : '—';
  });
  return sanitizeMessageText_(output, maxLength);
}

function notificationTemplateData_(student, fields) {
  student = student || {};
  fields = fields || {};
  return {
    ten_sinh_vien: student.full_name || student.student_name || '',
    mssv: student.student_id || '', email_sinh_vien: student.email || student.student_email || '',
    lop: student.class_name || '', loai_ho_so: fields.typeName || '', ma_ho_so: fields.documentCode || '',
    ma_yeu_cau: fields.requestCode || '', trang_thai: fields.status || '', ngay_du_kien: formatNotificationDate_(fields.expectedAt),
    quy_trinh: fields.workflow || '', buoc_xu_ly: fields.step || '', phan_hoi: fields.publicNote || '',
    noi_dung_trao_doi: fields.topic || '', ket_qua_xu_ly: fields.result || ''
  };
}

function formatNotificationDate_(value) {
  if (!value) return '';
  const date = dateValue_(value);
  if (!date || isNaN(date.getTime())) return '';
  return Utilities.formatDate(date, APP.TIMEZONE, 'dd/MM/yyyy');
}

function compileNotificationMessage_(body, title, templateKey, student, fields, fallbackTitle, translatedFields) {
  const templates = notificationTemplates_();
  const template = templates[templateKey];
  const data = notificationTemplateData_(student, fields);
  const rawBody = sanitizeNotificationBody_(body);
  const rawTitle = sanitizeNotificationTitle_(title);
  const bodyIsDefault = !!rawBody && rawBody === template.body;
  const titleIsDefault = !!rawTitle && rawTitle === template.title;
  return {
    body: rawBody ? renderNotificationTemplate_(rawBody, templateKey, data, 5000) : '',
    title: rawTitle ? renderNotificationTemplate_(rawTitle, templateKey, data, 200) : (fallbackTitle || template.title || ''),
    messageEn: bodyIsDefault ? renderNotificationTemplate_(template.bodyEn, templateKey, Object.assign({}, data, translatedFields), 5000) : '',
    titleEn: titleIsDefault ? template.titleEn : '',
    bodyIsDefault: bodyIsDefault,
    titleIsDefault: titleIsDefault
  };
}

function requestNextStatus_(request, action) {
  if (action === 'ACCEPT') return 'PROCESSING';
  if (action === 'READY') return 'READY';
  if (action === 'COMPLETE') return 'COMPLETED';
  if (action === 'REJECT') return 'REJECTED';
  if (action === 'CANCEL') return 'CANCELLED';
  return String(request.status || '');
}

function prepareRequestMessage_(request, action, payload, documentCode) {
  const documentId = request.document_id || (action === 'READY' ? 'doc_request_' + request.request_id : '');
  const document = documentId ? findBy_(APP.SHEETS.DOCUMENTS, 'document_id', documentId) : null;
  const next = requestNextStatus_(request, action);
  const fields = {
    typeName: request.type_name, requestCode: request.request_code,
    documentCode: document ? document.document_code : (documentCode || ''),
    status: DOCUMENT_REQUEST_STATUS_LABELS_[next] || next,
    expectedAt: parseDateInput_(payload.expectedAt) || request.expected_at,
    publicNote: sanitizeText_(payload.publicNote, 1500) || request.public_note || ''
  };
  const names = notificationTypeNames_(request.type_id, request.type_name);
  const labelsEn = {PENDING: 'Pending review', PROCESSING: 'In progress', READY: 'Ready for collection', COMPLETED: 'Collected', REJECTED: 'Rejected', CANCELLED: 'Cancelled'};
  return compileNotificationMessage_(payload.messageBody, '', 'request_' + action, request, fields, request.type_name, {
    loai_ho_so: names.en, trang_thai: labelsEn[next] || fields.status
  });
}

function getIdentity_() {
  if (runtimeCache_.identity) return runtimeCache_.identity;
  const email = normalizeEmail_(Session.getActiveUser().getEmail());
  if (!email) {
    throw new Error('AUTH_REQUIRED|Chưa nhận ra tài khoản Google. Đăng xuất tài khoản cá nhân rồi đăng nhập bằng tài khoản TDTU.');
  }
  const admin = getAdminRecord_(email);
  if (admin) {
    runtimeCache_.identity = { email: email, role: 'ADMIN', adminRole: admin.role || 'ADMIN', name: admin.name || '' };
    return runtimeCache_.identity;
  }
  if (!isStudentEmail_(email)) {
    throw new Error('ACCESS_DENIED|Chỉ sinh viên (@student.tdtu.edu.vn) và quản trị viên được cấp quyền mới vào được.');
  }
  runtimeCache_.identity = { email: email, role: 'STUDENT', studentId: extractStudentId_(email) };
  return runtimeCache_.identity;
}

function assertStudent_() {
  const identity = getIdentity_();
  if (identity.role !== 'STUDENT') throw new Error('STUDENT_ONLY|Chức năng này chỉ dành cho sinh viên.');
  return identity;
}

function assertAdmin_() {
  const identity = getIdentity_();
  if (identity.role !== 'ADMIN') throw new Error('ADMIN_ONLY|Tài khoản này không có quyền quản trị.');
  return identity;
}

function getAdminRecord_(email) {
  if (normalizeEmail_(email) === APP.DEFAULT_ADMIN) {
    return findBy_(APP.SHEETS.ADMINS, 'email', email) || { email: email, name: 'Nguyễn Thái Khôi', role: 'SUPER_ADMIN', active: true };
  }
  return readTable_(APP.SHEETS.ADMINS).find(function(row) {
    return normalizeEmail_(row.email) === normalizeEmail_(email) && toBoolean_(row.active);
  }) || null;
}

function saveStudentProfile(payload) {
  const identity = assertStudent_();
  payload = payload || {};
  const fullName = sanitizeText_(payload.fullName, 120);
  const className = sanitizeText_(payload.className, 80);
  if (fullName.length < 2) throw new Error('VALIDATION|Nhập họ và tên.');
  if (className.length < 2) throw new Error('VALIDATION|Nhập lớp.');
  if (!identity.studentId) throw new Error('STUDENT_ID_REQUIRED|Email không có MSSV dạng số. Liên hệ quản trị viên để được gán MSSV.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const now = new Date();
    const existing = findBy_(APP.SHEETS.STUDENTS, 'email', identity.email);
    const record = {
      student_id: identity.studentId,
      email: identity.email,
      full_name: fullName,
      class_name: className,
      active: true,
      created_at: existing ? existing.created_at : now,
      updated_at: now,
      updated_by: identity.email
    };
    if (existing) updateRow_(APP.SHEETS.STUDENTS, existing._row, record);
    else appendRecord_(APP.SHEETS.STUDENTS, record);
    audit_('SAVE_PROFILE', 'Student', identity.email, identity.email, { studentId: identity.studentId });
    return publicStudent_(record);
  } finally {
    lock.releaseLock();
  }
}

function getMyDashboard() {
  const identity = assertStudent_();
  return getStudentDashboard_(identity.email);
}

function getStudentDocumentsRaw_(email) {
  const target = normalizeEmail_(email);
  return readTable_(APP.SHEETS.DOCUMENTS).filter(function(row) {
    return normalizeEmail_(row.student_email) === target && toBoolean_(row.active);
  }).sort(sortDesc_('updated_at'));
}

function getStudentDashboard_(email, preloadedDocuments) {
  const target = normalizeEmail_(email);
  const documents = preloadedDocuments || getStudentDocumentsRaw_(target);
  const transactions = readTable_(APP.SHEETS.TRANSACTIONS).filter(function(row) {
    return normalizeEmail_(row.student_email) === target;
  });
  const notifications = readTable_(APP.SHEETS.NOTIFICATIONS).filter(function(row) {
    return normalizeEmail_(row.student_email) === target;
  });
  return {
    processing: documents.filter(function(row) { return ['Đã hoàn thành', 'Chờ sinh viên đến nhận', 'Đã bàn giao', 'Đã hủy'].indexOf(String(row.status)) === -1; }).length,
    supplement: documents.filter(function(row) { return String(row.status) === 'Yêu cầu bổ sung'; }).length,
    completed: documents.filter(function(row) { return ['Đã hoàn thành', 'Chờ sinh viên đến nhận', 'Đã bàn giao'].indexOf(String(row.status)) !== -1; }).length,
    waitingPickup: documents.filter(function(row) { return String(row.status) === 'Chờ sinh viên đến nhận'; }).length,
    pendingTransactions: transactions.filter(function(row) { return ['PENDING', 'PARTIAL'].indexOf(String(row.status)) !== -1; }).length,
    unreadNotifications: notifications.filter(function(row) { return !toBoolean_(row.read); }).length
  };
}

function getAdminDashboard_() {
  const docs = readTable_(APP.SHEETS.DOCUMENTS).filter(function(row) { return toBoolean_(row.active); });
  const txs = readTable_(APP.SHEETS.TRANSACTIONS);
  const services = readTable_(APP.SHEETS.SERVICES);
  const requests = readTable_(APP.SHEETS.REQUESTS);
  return {
    pendingTransactions: txs.filter(function(row) { return ['PENDING', 'PARTIAL'].indexOf(String(row.status)) !== -1; }).length,
    openDocumentRequests: requests.filter(function(row) { return OPEN_DOCUMENT_REQUEST_STATUSES_.indexOf(String(row.status)) !== -1; }).length,
    storedDocuments: docs.filter(function(row) { return String(row.storage_status) === 'AT_OFFICE'; }).length,
    processing: docs.filter(function(row) { return ['Đã hoàn thành', 'Đã bàn giao', 'Đã hủy'].indexOf(String(row.status)) === -1; }).length,
    supplement: docs.filter(function(row) { return String(row.status) === 'Yêu cầu bổ sung'; }).length,
    waitingPickup: docs.filter(function(row) { return String(row.status) === 'Chờ sinh viên đến nhận'; }).length,
    activeServiceSessions: services.filter(function(row) { return String(row.status) === 'RUNNING'; }).length
  };
}

function listDocumentTypes(includeInactive) {
  const identity = getIdentity_();
  const rows = readTable_(APP.SHEETS.TYPES).filter(function(row) {
    return identity.role === 'ADMIN' && includeInactive ? true : toBoolean_(row.active);
  });
  return rows.sort(function(a, b) { return Number(a.sort_order || 0) - Number(b.sort_order || 0); }).map(publicType_);
}

function saveDocumentType(payload) {
  const admin = assertAdmin_();
  payload = payload || {};
  const name = sanitizeText_(payload.name, 160);
  if (!name) throw new Error('VALIDATION|Tên loại hồ sơ không được để trống.');
  const existing = payload.typeId ? findBy_(APP.SHEETS.TYPES, 'type_id', payload.typeId) : null;
  const now = new Date();
  const typeId = existing ? existing.type_id : ('type_' + shortId_());
  const tracksProgress = toBoolean_(payload.tracksProgress);
  const handoverMode = normalizeHandoverMode_(payload.handoverMode || (existing && existing.handover_mode) || 'SUBMIT');
  const requestEnabled = payload.requestEnabled === undefined ? toBoolean_(existing && existing.request_enabled) : toBoolean_(payload.requestEnabled);
  if (requestEnabled && ['RECEIVE', 'BOTH'].indexOf(handoverMode) === -1) {
    throw new Error('VALIDATION|Chỉ loại hồ sơ có hình thức nhận được sinh viên yêu cầu cấp.');
  }
  const workflows = readTable_(APP.SHEETS.WORKFLOW_VERSIONS).filter(function(row) { return toBoolean_(row.active); });
  const defaultWorkflow = workflows.length ? workflows[0].workflow_version_id : '';
  const requestedWorkflow = sanitizeId_(payload.workflowVersionId);
  const maxSortOrder = readTable_(APP.SHEETS.TYPES).reduce(function(max, row) { return Math.max(max, Number(row.sort_order || 0)); }, 0);
  const record = {
    type_id: typeId,
    name: name,
    description: sanitizeText_(payload.description, 500) || name,
    tracks_progress: tracksProgress,
    workflow_version_id: tracksProgress ? (requestedWorkflow || (existing && existing.workflow_version_id) || defaultWorkflow) : '',
    active: payload.active !== false,
    sort_order: Number(payload.sortOrder || (existing && existing.sort_order) || (maxSortOrder + 1)),
    created_at: existing ? existing.created_at : now,
    updated_at: now,
    handover_mode: handoverMode,
    name_en: sanitizeText_(payload.nameEn, 160) || (existing && existing.name_en) || '',
    description_en: sanitizeText_(payload.descriptionEn, 500) || (existing && existing.description_en) || '',
    request_enabled: requestEnabled
  };
  if (existing) updateRow_(APP.SHEETS.TYPES, existing._row, record);
  else appendRecord_(APP.SHEETS.TYPES, record);
  audit_('SAVE_DOCUMENT_TYPE', 'DocumentType', typeId, admin.email, { name: name, handoverMode: handoverMode });
  return publicType_(record);
}

function deleteDocumentType(typeId) {
  const admin = assertAdmin_();
  typeId = sanitizeId_(typeId);
  if (!typeId) throw new Error('VALIDATION|Mã loại hồ sơ không hợp lệ.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const type = findBy_(APP.SHEETS.TYPES, 'type_id', typeId);
    if (!type) throw new Error('NOT_FOUND|Không tìm thấy loại hồ sơ cần xoá.');

    const documentCount = readTable_(APP.SHEETS.DOCUMENTS).filter(function(row) { return row.type_id === typeId; }).length;
    const transactionItemCount = readTable_(APP.SHEETS.ITEMS).filter(function(row) { return row.type_id === typeId; }).length;
    const requestCount = readTable_(APP.SHEETS.REQUESTS).filter(function(row) { return row.type_id === typeId; }).length;
    if (documentCount || transactionItemCount || requestCount) {
      throw new Error('IN_USE|Loại đã có hồ sơ hoặc yêu cầu nên không thể xoá. Chọn “Ngừng sử dụng” để giữ lịch sử.');
    }

    deleteRow_(APP.SHEETS.TYPES, type._row);
    audit_('DELETE_DOCUMENT_TYPE', 'DocumentType', typeId, admin.email, { name: type.name });
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

const OPEN_DOCUMENT_REQUEST_STATUSES_ = Object.freeze(['PENDING', 'PROCESSING', 'READY']);
const DOCUMENT_REQUEST_STATUS_LABELS_ = Object.freeze({
  PENDING: 'Chờ tiếp nhận', PROCESSING: 'Đang xử lý', READY: 'Chờ nhận',
  COMPLETED: 'Đã nhận', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy'
});

function createDocumentRequest(payload) {
  const identity = assertStudent_();
  const profile = requireProfile_(identity.email);
  payload = payload || {};
  const typeId = sanitizeId_(payload.typeId);
  const purpose = sanitizeText_(payload.purpose, 1000);
  const copyCount = Number(payload.copyCount);
  const studentNote = sanitizeText_(payload.note, 1000);
  const requestToken = sanitizeId_(payload.requestToken);
  if (!typeId) throw new Error('VALIDATION|Chọn loại hồ sơ cần yêu cầu.');
  if (!purpose) throw new Error('VALIDATION|Nhập mục đích sử dụng hồ sơ.');
  if (!Number.isInteger(copyCount) || copyCount < 1 || copyCount > 20) throw new Error('VALIDATION|Số bản phải từ 1 đến 20.');
  if (!requestToken) throw new Error('VALIDATION|Mã gửi yêu cầu không hợp lệ. Tải lại trang rồi thử lại.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const prior = findBy_(APP.SHEETS.REQUESTS, 'request_token', requestToken);
    if (prior) {
      if (normalizeEmail_(prior.student_email) !== identity.email) throw new Error('ACCESS_DENIED|Mã yêu cầu này không thuộc tài khoản của bạn.');
      return publicDocumentRequest_(prior, false);
    }
    const type = readTable_(APP.SHEETS.TYPES).find(function(row) {
      return row.type_id === typeId && toBoolean_(row.active) && toBoolean_(row.request_enabled) && ['RECEIVE', 'BOTH'].indexOf(normalizeHandoverMode_(row.handover_mode || 'BOTH')) !== -1;
    });
    if (!type) throw new Error('VALIDATION|Loại hồ sơ không được phép yêu cầu hoặc đã ngừng sử dụng.');
    const duplicate = readTable_(APP.SHEETS.REQUESTS).find(function(row) {
      return normalizeEmail_(row.student_email) === identity.email && row.type_id === typeId && OPEN_DOCUMENT_REQUEST_STATUSES_.indexOf(String(row.status)) !== -1;
    });
    if (duplicate) throw new Error('DUPLICATE_REQUEST|Bạn đã có yêu cầu ' + duplicate.request_code + ' cho loại hồ sơ này và yêu cầu vẫn đang mở.');
    const now = new Date();
    const requestId = 'dreq_' + shortId_();
    const request = {
      request_id: requestId, request_code: makeCode_('YC'), student_id: profile.student_id,
      student_email: identity.email, student_name: profile.full_name, class_name: profile.class_name,
      type_id: type.type_id, type_name: type.name, purpose: purpose, copy_count: copyCount,
      student_note: studentNote, status: 'PENDING', expected_at: '', public_note: '', internal_note: '',
      document_id: '', created_at: now, updated_at: now, updated_by: identity.email, version: 1,
      request_token: requestToken
    };
    appendRecord_(APP.SHEETS.REQUESTS, request);
    appendDocumentRequestEvent_(request, '', 'PENDING', '', '', identity.email, 'create_' + requestToken);
    audit_('CREATE_DOCUMENT_REQUEST', 'DocumentRequest', requestId, identity.email, { typeId: typeId, copyCount: copyCount });
    notify_(identity.email, '', 'Đã gửi yêu cầu cấp hồ sơ', 'Yêu cầu ' + request.request_code + ' đã được gửi và đang chờ tiếp nhận.', identity.email, false, null, requestId);
    return publicDocumentRequest_(request, false);
  } finally {
    lock.releaseLock();
  }
}

function listMyDocumentRequests(filters) {
  const identity = assertStudent_();
  return listDocumentRequests_(filters || {}, identity.email, false);
}

function listDocumentRequests(filters) {
  assertAdmin_();
  return listDocumentRequests_(filters || {}, '', true);
}

function listDocumentRequests_(filters, ownerEmail, adminView) {
  filters = filters || {};
  const query = normalizeSearch_(filters.query);
  const typeId = sanitizeId_(filters.typeId);
  const status = String(filters.status || '').trim().toUpperCase();
  const from = parseDateInput_(filters.from);
  const to = parseDateInput_(filters.to);
  if (to) to.setHours(23, 59, 59, 999);
  const exactStudentEmail = adminView ? normalizeEmail_(filters.studentEmail) : '';
  let page = Math.max(1, Math.floor(Number(filters.page) || 1));
  const pageSize = Math.max(1, Math.min(100, Math.floor(Number(filters.pageSize) || 25)));
  const requests = readTable_(APP.SHEETS.REQUESTS).filter(function(row) {
    if (ownerEmail && normalizeEmail_(row.student_email) !== ownerEmail) return false;
    if (exactStudentEmail && normalizeEmail_(row.student_email) !== exactStudentEmail) return false;
    if (typeId && row.type_id !== typeId) return false;
    if (status === 'OPEN' && OPEN_DOCUMENT_REQUEST_STATUSES_.indexOf(String(row.status)) === -1) return false;
    if (status && status !== 'OPEN' && String(row.status) !== status) return false;
    const created = dateValue_(row.created_at);
    if (from && created < from) return false;
    if (to && created > to) return false;
    if (query && ![row.request_code, row.student_id, row.student_email, row.student_name, row.class_name, row.type_name]
      .some(function(value) { return normalizeSearch_(value).indexOf(query) !== -1; })) return false;
    return true;
  }).sort(sortDesc_('created_at'));
  const total = requests.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  page = Math.min(page, pages);
  return { items: requests.slice((page - 1) * pageSize, page * pageSize).map(function(row) { return publicDocumentRequest_(row, adminView); }), total: total, page: page, pageSize: pageSize, pages: pages };
}

function getDocumentRequestDetail(requestId) {
  const identity = getIdentity_();
  const request = findBy_(APP.SHEETS.REQUESTS, 'request_id', sanitizeId_(requestId));
  if (!request) throw new Error('NOT_FOUND|Không tìm thấy yêu cầu cấp hồ sơ.');
  const adminView = identity.role === 'ADMIN';
  if (!adminView && normalizeEmail_(request.student_email) !== identity.email) throw new Error('ACCESS_DENIED|Bạn không có quyền xem yêu cầu này.');
  const result = publicDocumentRequest_(request, adminView);
  result.events = readTable_(APP.SHEETS.REQUEST_EVENTS).filter(function(row) { return row.request_id === request.request_id; })
    .sort(sortAsc_('created_at')).map(function(row) { return publicDocumentRequestEvent_(row, adminView); });
  return result;
}

function updateDocumentRequest(payload) {
  payload = payload || {};
  const identity = getIdentity_();
  const requestId = sanitizeId_(payload.requestId);
  const action = String(payload.action || '').trim().toUpperCase();
  const actionToken = sanitizeId_(payload.actionToken);
  if (!requestId || !actionToken) throw new Error('VALIDATION|Yêu cầu hoặc mã thao tác không hợp lệ.');
  if (identity.role === 'STUDENT' && action !== 'CANCEL') throw new Error('ADMIN_ONLY|Thao tác này chỉ dành cho quản trị viên.');
  if (identity.role === 'ADMIN' && ['ACCEPT', 'READY', 'COMPLETE', 'REJECT', 'CANCEL', 'UPDATE'].indexOf(action) === -1) throw new Error('VALIDATION|Thao tác yêu cầu không hợp lệ.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const priorEvent = readTable_(APP.SHEETS.REQUEST_EVENTS).find(function(row) { return row.action_token === actionToken; });
    if (priorEvent) {
      const priorRequest = findBy_(APP.SHEETS.REQUESTS, 'request_id', priorEvent.request_id);
      if (!priorRequest || priorRequest.request_id !== requestId) throw new Error('ACCESS_DENIED|Mã thao tác đã được dùng cho yêu cầu khác.');
      if (identity.role !== 'ADMIN' && normalizeEmail_(priorRequest.student_email) !== identity.email) throw new Error('ACCESS_DENIED|Bạn không có quyền xem yêu cầu này.');
      return publicDocumentRequest_(priorRequest, identity.role === 'ADMIN');
    }
    const request = findBy_(APP.SHEETS.REQUESTS, 'request_id', requestId);
    if (!request) throw new Error('NOT_FOUND|Không tìm thấy yêu cầu cấp hồ sơ.');
    const adminView = identity.role === 'ADMIN';
    if (!adminView && normalizeEmail_(request.student_email) !== identity.email) throw new Error('ACCESS_DENIED|Bạn không có quyền sửa yêu cầu này.');
    if (payload.version != null && Number(payload.version) !== Number(request.version || 0)) throw new Error('VERSION_CONFLICT|Yêu cầu vừa được cập nhật. Tải lại để xem trạng thái mới.');
    const result = transitionDocumentRequest_(request, action, payload, identity, actionToken);
    return publicDocumentRequest_(result, adminView);
  } finally {
    lock.releaseLock();
  }
}

function batchUpdateDocumentRequests(payload) {
  const admin = assertAdmin_();
  payload = payload || {};
  const action = String(payload.action || '').trim().toUpperCase();
  if (['ACCEPT', 'READY'].indexOf(action) === -1) throw new Error('VALIDATION|Chọn tiếp nhận hoặc chuyển chờ nhận.');
  const ids = Array.isArray(payload.requestIds) ? payload.requestIds.map(sanitizeId_).filter(Boolean) : [];
  const uniqueIds = ids.filter(function(id, index) { return ids.indexOf(id) === index; });
  if (!uniqueIds.length || uniqueIds.length > 20) throw new Error('VALIDATION|Chọn từ 1 đến 20 yêu cầu.');
  const versions = payload.versions || {};
  const batchToken = sanitizeId_(payload.actionToken);
  if (!batchToken || batchToken.length > 95) throw new Error('VALIDATION|Mã thao tác hàng loạt không hợp lệ.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const rows = uniqueIds.map(function(id, index) {
      const row = findBy_(APP.SHEETS.REQUESTS, 'request_id', id);
      if (!row) throw new Error('NOT_FOUND|Không tìm thấy một trong các yêu cầu đã chọn.');
      const expected = action === 'ACCEPT' ? 'PENDING' : 'PROCESSING';
      const actionToken = batchToken + '_' + index;
      const prior = readTable_(APP.SHEETS.REQUEST_EVENTS).find(function(event) { return event.action_token === actionToken && event.request_id === row.request_id; });
      const target = action === 'ACCEPT' ? 'PROCESSING' : 'READY';
      if (prior && String(row.status) === target) return { row: row, done: true };
      if (String(row.status) !== expected) throw new Error('VERSION_CONFLICT|Một yêu cầu đã đổi trạng thái. Tải lại danh sách rồi thử lại.');
      if (versions[id] != null && Number(versions[id]) !== Number(row.version || 0)) throw new Error('VERSION_CONFLICT|Một yêu cầu vừa được cập nhật. Tải lại danh sách rồi thử lại.');
      return { row: row, done: false };
    });
    rows.forEach(function(entry) {
      if (entry.done) return;
      const existingDocumentId = entry.row.document_id || (action === 'READY' ? 'doc_request_' + entry.row.request_id : '');
      const existingDocument = existingDocumentId ? findBy_(APP.SHEETS.DOCUMENTS, 'document_id', existingDocumentId) : null;
      entry.preparedDocumentCode = action === 'READY' && !existingDocument ? makeCode_('HS') : '';
      entry.preparedNotification = prepareRequestMessage_(entry.row, action, payload, entry.preparedDocumentCode);
    });
    const output = rows.map(function(entry, index) {
      const actionToken = batchToken + '_' + index;
      const actionPayload = Object.assign({}, payload, {_preparedDocumentCode: entry.preparedDocumentCode, _preparedNotification: entry.preparedNotification});
      return publicDocumentRequest_(entry.done ? entry.row : transitionDocumentRequest_(entry.row, action, actionPayload, admin, actionToken), true);
    });
    audit_('BATCH_UPDATE_DOCUMENT_REQUESTS', 'DocumentRequest', uniqueIds.join(','), admin.email, { action: action, count: output.length });
    return { items: output, updated: output.length };
  } finally {
    lock.releaseLock();
  }
}

function transitionDocumentRequest_(request, action, payload, actor, actionToken) {
  const isAdmin = actor.role === 'ADMIN';
  const current = String(request.status);
  const now = new Date();
  const publicNote = sanitizeText_(payload.publicNote, 1500);
  const internalNote = isAdmin ? sanitizeText_(payload.internalNote, 1500) : '';
  const messageBody = sanitizeNotificationBody_(payload.messageBody);
  const expectedAt = parseDateInput_(payload.expectedAt);
  let next = current;
  if (action === 'CANCEL') {
    if (OPEN_DOCUMENT_REQUEST_STATUSES_.indexOf(current) === -1) throw new Error('VALIDATION|Chỉ có thể hủy yêu cầu đang mở.');
    if (!isAdmin && current !== 'PENDING') throw new Error('VALIDATION|Sinh viên chỉ có thể hủy yêu cầu đang chờ tiếp nhận.');
    if (isAdmin && !publicNote) throw new Error('VALIDATION|Nhập lý do hủy để sinh viên biết.');
    next = 'CANCELLED';
  } else if (action === 'ACCEPT' && isAdmin && current === 'PENDING') next = 'PROCESSING';
  else if (action === 'READY' && isAdmin && current === 'PROCESSING') next = 'READY';
  else if (action === 'COMPLETE' && isAdmin && current === 'READY') next = 'COMPLETED';
  else if (action === 'REJECT' && isAdmin && ['PENDING', 'PROCESSING'].indexOf(current) !== -1) {
    if (!publicNote) throw new Error('VALIDATION|Nhập lý do từ chối.');
    next = 'REJECTED';
  } else if (action === 'UPDATE' && isAdmin && OPEN_DOCUMENT_REQUEST_STATUSES_.indexOf(current) !== -1) {
    if (!publicNote && !internalNote && !expectedAt) throw new Error('VALIDATION|Nhập nội dung cập nhật hoặc ngày dự kiến.');
  } else throw new Error('VALIDATION|Thao tác không phù hợp với trạng thái hiện tại của yêu cầu.');

  const patch = { status: next, updated_at: now, updated_by: actor.email, version: Number(request.version || 0) + 1 };
  if (expectedAt) patch.expected_at = expectedAt;
  if (publicNote) patch.public_note = publicNote;
  if (internalNote) patch.internal_note = internalNote;
  let document = request.document_id ? findBy_(APP.SHEETS.DOCUMENTS, 'document_id', request.document_id) : null;
  if (!document && next === 'READY') document = findBy_(APP.SHEETS.DOCUMENTS, 'document_id', 'doc_request_' + request.request_id);
  if (document && next === 'READY' && !patch.document_id) patch.document_id = document.document_id;
  const preparedDocumentCode = payload._preparedDocumentCode || (next === 'READY' && !document ? makeCode_('HS') : '');
  const preparedNotification = payload._preparedNotification || prepareRequestMessage_(request, action, payload, preparedDocumentCode);
  if (next === 'READY' && !document) {
    const type = findBy_(APP.SHEETS.TYPES, 'type_id', request.type_id);
    if (!type) throw new Error('DATA_ERROR|Không tìm thấy loại hồ sơ của yêu cầu.');
    const documentId = 'doc_request_' + request.request_id;
    document = findBy_(APP.SHEETS.DOCUMENTS, 'document_id', documentId);
    if (!document) {
      document = {
        document_id: documentId, document_code: preparedDocumentCode, student_id: request.student_id,
        student_email: request.student_email, student_name: request.student_name, class_name: request.class_name,
        type_id: request.type_id, type_name: request.type_name, workflow_version_id: '', current_step_id: '',
        current_step_order: 0, status: 'Chờ sinh viên đến nhận', storage_status: 'AT_OFFICE',
        submitted_at: now, expected_at: expectedAt || request.expected_at || '', updated_at: now,
        updated_by: actor.email, public_note: publicNote || 'Hồ sơ đã được chuẩn bị và đang chờ sinh viên đến nhận.',
        internal_note: '', version: 1, active: true, request_id: request.request_id
      };
      appendRecord_(APP.SHEETS.DOCUMENTS, document);
      appendRecord_(APP.SHEETS.EVENTS, { event_id: 'evt_req_ready_' + request.request_id, document_id: documentId, event_type: 'REQUEST_READY', from_step_id: '', to_step_id: '', status: document.status, public_note: document.public_note, internal_note: '', created_at: now, created_by: actor.email });
    }
    patch.document_id = document.document_id;
  }
  if (action === 'COMPLETE') {
    if (!document) throw new Error('DATA_ERROR|Yêu cầu chưa có hồ sơ sẵn sàng để bàn giao.');
    handOverDocument_(document.document_id, actor.email, publicNote, 'evt_req_handover_' + request.request_id, true);
  }
  if (action === 'UPDATE' && document) {
    updateRow_(APP.SHEETS.DOCUMENTS, document._row, {
      expected_at: expectedAt || document.expected_at,
      public_note: publicNote || document.public_note,
      internal_note: internalNote || document.internal_note,
      updated_at: now, updated_by: actor.email, version: Number(document.version || 0) + 1
    });
    appendRecord_(APP.SHEETS.EVENTS, { event_id: 'evt_req_update_' + actionToken, document_id: document.document_id, event_type: 'REQUEST_UPDATED', from_step_id: '', to_step_id: '', status: document.status, public_note: publicNote, internal_note: internalNote, created_at: now, created_by: actor.email });
  }
  updateRow_(APP.SHEETS.REQUESTS, request._row, patch);
  if (document && next === 'CANCELLED' && toBoolean_(document.active)) {
    rejectPendingPickupTransactions_(document, actor.email, publicNote || 'Yêu cầu cấp hồ sơ đã bị hủy.');
    updateRow_(APP.SHEETS.DOCUMENTS, document._row, { status: 'Đã hủy', active: false, public_note: publicNote || 'Yêu cầu cấp hồ sơ đã bị hủy.', updated_at: now, updated_by: actor.email, version: Number(document.version || 0) + 1 });
    appendRecord_(APP.SHEETS.EVENTS, { event_id: 'evt_req_cancel_' + actionToken, document_id: document.document_id, event_type: 'REQUEST_CANCELLED', from_step_id: '', to_step_id: '', status: 'Đã hủy', public_note: publicNote, internal_note: '', created_at: now, created_by: actor.email });
  }
  const updated = Object.assign({}, request, patch);
  if (document && !patch.document_id) updated.document_id = document.document_id;
  appendDocumentRequestEvent_(updated, current, next, publicNote, internalNote, actor.email, actionToken);
  const labels = DOCUMENT_REQUEST_STATUS_LABELS_;
  let message = preparedNotification.body || publicNote || ('Yêu cầu ' + request.request_code + ' đã chuyển sang trạng thái: ' + labels[next] + '.');
  if (!preparedNotification.body && !publicNote && action === 'ACCEPT') message = 'Văn phòng Khoa đã tiếp nhận yêu cầu ' + request.request_code + ' và đang xử lý.';
  if (!preparedNotification.body && !publicNote && action === 'READY') message = 'Hồ sơ ' + request.type_name + ' đã sẵn sàng. Sinh viên vui lòng đến Văn phòng Khoa để nhận.';
  if (!preparedNotification.body && !publicNote && action === 'COMPLETE') message = 'Hồ sơ ' + request.type_name + ' đã được bàn giao.';
  const requestI18n = {
    titleKey: '', messageKey: 'requestAction_' + action,
    messageEn: preparedNotification.messageEn,
    params: {code: request.request_code, type: request.type_name, status: labels[next], expected: formatNotificationDate_(expectedAt || request.expected_at), note: publicNote},
    customMessage: !!preparedNotification.body && !preparedNotification.bodyIsDefault, customTitle: false
  };
  notify_(request.student_email, document ? document.document_id : '', preparedNotification.title || request.type_name, message, actor.email, isAdmin && toBoolean_(payload.sendEmail), requestI18n, request.request_id);
  audit_('UPDATE_DOCUMENT_REQUEST', 'DocumentRequest', request.request_id, actor.email, { action: action, from: current, to: next });
  return updated;
}

function appendDocumentRequestEvent_(request, fromStatus, toStatus, publicNote, internalNote, actorEmail, actionToken) {
  appendRecord_(APP.SHEETS.REQUEST_EVENTS, { event_id: 'reqevt_' + shortId_(), request_id: request.request_id, event_type: toStatus === fromStatus ? 'UPDATED' : 'STATUS_CHANGED', from_status: fromStatus || '', to_status: toStatus, public_note: publicNote || '', internal_note: internalNote || '', created_at: new Date(), created_by: actorEmail, action_token: actionToken });
}

function publicDocumentRequest_(row, adminView) {
  const names = notificationTypeNames_(row.type_id, row.type_name);
  const result = { requestId: row.request_id, code: row.request_code, studentId: row.student_id, studentEmail: row.student_email, studentName: row.student_name, className: row.class_name, typeId: row.type_id, typeName: row.type_name, typeNameEn: names.en, purpose: row.purpose || '', copyCount: Number(row.copy_count || 1), note: row.student_note || '', status: row.status, statusLabel: DOCUMENT_REQUEST_STATUS_LABELS_[row.status] || row.status, expectedAt: iso_(row.expected_at), publicNote: row.public_note || '', documentId: row.document_id || '', createdAt: iso_(row.created_at), updatedAt: iso_(row.updated_at), updatedBy: row.updated_by || '', version: Number(row.version || 0) };
  if (adminView) result.internalNote = row.internal_note || '';
  return result;
}

function publicDocumentRequestEvent_(row, adminView) {
  const result = { eventId: row.event_id, type: row.event_type, fromStatus: row.from_status || '', toStatus: row.to_status, createdAt: iso_(row.created_at), createdBy: row.created_by || '', publicNote: row.public_note || '' };
  if (adminView) result.internalNote = row.internal_note || '';
  return result;
}

function createTransaction(payload) {
  const identity = assertStudent_();
  const profile = requireProfile_(identity.email);
  payload = payload || {};
  const transactionType = String(payload.transactionType || '').toUpperCase();
  if (['SUBMIT', 'RECEIVE', 'SUPPLEMENT'].indexOf(transactionType) === -1) {
    throw new Error('VALIDATION|Hình thức yêu cầu không hợp lệ.');
  }
  const requestToken = sanitizeId_(payload.requestToken) || Utilities.getUuid();
  const selected = Array.isArray(payload.items) ? payload.items : [];
  if (!selected.length || selected.length > 20) throw new Error('VALIDATION|Chọn từ 1 đến 20 giấy tờ.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const duplicate = findBy_(APP.SHEETS.TRANSACTIONS, 'request_token', requestToken);
    if (duplicate) return getTransactionResult_(duplicate.transaction_id, identity.email, false);

    const types = readTable_(APP.SHEETS.TYPES);
    const documents = readTable_(APP.SHEETS.DOCUMENTS);
    const normalizedItems = selected.map(function(item) {
      item = item || {};
      if (transactionType === 'SUBMIT' || (transactionType === 'RECEIVE' && item.typeId && !item.documentId)) {
        const type = types.find(function(row) { return row.type_id === item.typeId && toBoolean_(row.active); });
        if (!type) throw new Error('VALIDATION|Có loại hồ sơ không hợp lệ hoặc đã ngừng sử dụng.');
        if (transactionType === 'RECEIVE' && toBoolean_(type.request_enabled)) throw new Error('VALIDATION|Loại hồ sơ này cần được yêu cầu cấp và chuẩn bị trước khi sinh viên đăng ký nhận.');
        if (!typeAllowsTransaction_(type, transactionType)) {
          throw new Error('VALIDATION|Loại hồ sơ ' + type.name + ' không áp dụng cho hình thức này.');
        }
        return { typeId: type.type_id, typeName: type.name, documentId: '', relatedDocumentId: '' };
      }
      const documentId = sanitizeId_(item.documentId || item.relatedDocumentId);
      const document = documents.find(function(row) {
        return row.document_id === documentId && normalizeEmail_(row.student_email) === identity.email && toBoolean_(row.active);
      });
      if (!document) throw new Error('NOT_FOUND|Không tìm thấy hồ sơ thuộc tài khoản sinh viên này.');
      if (transactionType === 'RECEIVE' && String(document.status) !== 'Chờ sinh viên đến nhận') {
        throw new Error('VALIDATION|Hồ sơ ' + document.document_code + ' chưa sẵn sàng bàn giao.');
      }
      return {
        typeId: document.type_id,
        typeName: document.type_name,
        documentId: transactionType === 'RECEIVE' ? document.document_id : '',
        relatedDocumentId: transactionType === 'SUPPLEMENT' ? document.document_id : ''
      };
    });
    const uniqueItems = {};
    normalizedItems.forEach(function(item) {
      const key = [item.typeId, item.documentId, item.relatedDocumentId].join('|');
      if (uniqueItems[key]) throw new Error('VALIDATION|Danh sách có giấy tờ bị chọn trùng.');
      uniqueItems[key] = true;
    });

    const now = new Date();
    const transactionId = 'tx_' + shortId_();
    const transaction = {
      transaction_id: transactionId,
      transaction_code: makeCode_('GD'),
      student_id: profile.student_id,
      student_email: identity.email,
      student_name: profile.full_name,
      class_name: profile.class_name,
      transaction_type: transactionType,
      status: 'PENDING',
      student_note: sanitizeText_(payload.note, 1000),
      request_token: requestToken,
      created_at: now,
      updated_at: now,
      reviewed_by: ''
    };
    appendRecord_(APP.SHEETS.TRANSACTIONS, transaction);
    normalizedItems.forEach(function(item) {
      appendRecord_(APP.SHEETS.ITEMS, {
        item_id: 'item_' + shortId_(),
        transaction_id: transactionId,
        type_id: item.typeId,
        type_name: item.typeName,
        document_id: item.documentId,
        related_document_id: item.relatedDocumentId,
        status: 'PENDING',
        admin_note: '',
        created_at: now,
        reviewed_at: '',
        reviewed_by: ''
      });
    });
    audit_('CREATE_TRANSACTION', 'Transaction', transactionId, identity.email, { type: transactionType, itemCount: normalizedItems.length });
    notify_(identity.email, '', 'Đã gửi yêu cầu', 'Yêu cầu ' + transaction.transaction_code + ' đang chờ cán bộ xác nhận.', identity.email, false, {
      titleKey: 'requestSentTitle', messageKey: 'requestWaiting', params: { code: transaction.transaction_code }
    });
    return getTransactionResult_(transactionId, identity.email, false);
  } finally {
    lock.releaseLock();
  }
}

function listMyTransactions() {
  const identity = assertStudent_();
  const txs = readTable_(APP.SHEETS.TRANSACTIONS).filter(function(row) {
    return normalizeEmail_(row.student_email) === identity.email;
  }).sort(sortDesc_('created_at'));
  return buildTransactionResults_(txs, identity.email, false);
}

function listPendingTransactions() {
  assertAdmin_();
  return listPendingTransactions_();
}

function listPendingTransactions_() {
  const txs = readTable_(APP.SHEETS.TRANSACTIONS).filter(function(row) {
    return ['PENDING', 'PARTIAL'].indexOf(String(row.status)) !== -1;
  }).sort(sortDesc_('created_at'));
  return buildTransactionResults_(txs, '', true);
}

function getAdminWorkSummary() {
  assertAdmin_();
  return buildAdminWorkSummary_();
}

function buildAdminWorkSummary_() {
  const groups = Object.create(null);
  const types = {};
  readTable_(APP.SHEETS.TYPES).forEach(function(type) { types[type.type_id] = type; });
  const documents = readTable_(APP.SHEETS.DOCUMENTS);
  const documentsById = {};
  const linkedDocumentIds = Object.create(null);
  const workflowStatuses = {};
  documents.forEach(function(document) { documentsById[document.document_id] = document; });
  const requests = readTable_(APP.SHEETS.REQUESTS);
  requests.forEach(function(request) {
    if (request.document_id) linkedDocumentIds[request.document_id] = true;
    if (request.request_id) linkedDocumentIds['doc_request_' + request.request_id] = true;
  });

  function documentStatusEnglish_(document) {
    const workflowId = document.workflow_version_id;
    if (!workflowId) return '';
    if (!workflowStatuses[workflowId]) {
      workflowStatuses[workflowId] = {};
      getWorkflowSteps_(workflowId).forEach(function(step) {
        workflowStatuses[workflowId][step.status_label] = step.status_label_en || '';
      });
    }
    return workflowStatuses[workflowId][document.status] || '';
  }

  function addItem(row, bucket, source, code, status, createdAt, expectedAt, secondaryCode, statusEn) {
    const type = types[row.type_id] || {};
    const typeName = type.name || row.type_name || 'Khác';
    const key = String(row.type_id || typeName);
    if (!groups[key]) {
      groups[key] = {
        typeId: row.type_id || '', typeName: typeName,
        typeNameEn: type.name_en || typeName, pendingCount: 0, processingCount: 0, items: []
      };
    }
    const group = groups[key];
    if (bucket === 'PENDING') group.pendingCount += 1;
    else group.processingCount += 1;
    group.items.push({
      studentName: row.student_name || '', studentId: row.student_id || '', className: row.class_name || '',
      code: code || '', secondaryCode: secondaryCode || '', source: source || '',
      status: status || '', statusEn: statusEn || '', bucket: bucket, copyCount: Number(row.copy_count || 0),
      createdAt: iso_(createdAt), expectedAt: iso_(expectedAt)
    });
  }

  requests.forEach(function(request) {
    const status = String(request.status || '');
    if (status !== 'PENDING' && status !== 'PROCESSING') return;
    addItem(request, status === 'PENDING' ? 'PENDING' : 'PROCESSING', 'REQUEST', request.request_code,
      DOCUMENT_REQUEST_STATUS_LABELS_[status] || status, request.created_at, request.expected_at);
  });

  const transactionsById = {};
  readTable_(APP.SHEETS.TRANSACTIONS).forEach(function(transaction) { transactionsById[transaction.transaction_id] = transaction; });
  readTable_(APP.SHEETS.ITEMS).forEach(function(item) {
    if (String(item.status) !== 'PENDING') return;
    const transaction = transactionsById[item.transaction_id];
    if (!transaction || ['PENDING', 'PARTIAL'].indexOf(String(transaction.status)) === -1) return;
    const linkedDocument = documentsById[item.document_id || item.related_document_id];
    addItem({
      type_id: item.type_id, type_name: item.type_name, student_name: transaction.student_name,
      student_id: transaction.student_id, class_name: transaction.class_name
    }, 'PENDING', transaction.transaction_type, transaction.transaction_code, 'Chờ xác nhận',
    transaction.created_at, '', linkedDocument && linkedDocument.document_code);
  });

  const finishedStatuses = ['Đã hoàn thành', 'Đã bàn giao', 'Đã hủy', 'Chờ sinh viên đến nhận', 'Yêu cầu bổ sung'];
  documents.forEach(function(document) {
    if (!toBoolean_(document.active) || linkedDocumentIds[document.document_id] || document.request_id) return;
    const status = String(document.status || '');
    if (finishedStatuses.indexOf(status) !== -1) return;
    const bucket = status === 'Đã tiếp nhận' ? 'PENDING' : 'PROCESSING';
    addItem(document, bucket, 'DOCUMENT', document.document_code, status, document.submitted_at, document.expected_at, '', documentStatusEnglish_(document));
  });

  const result = Object.keys(groups).map(function(key) {
    const group = groups[key];
    group.items.sort(function(a, b) { return dateValue_(b.createdAt).getTime() - dateValue_(a.createdAt).getTime(); });
    return group;
  });
  result.sort(function(a, b) {
    return b.pendingCount - a.pendingCount || (b.pendingCount + b.processingCount) - (a.pendingCount + a.processingCount) || a.typeName.localeCompare(b.typeName);
  });
  return {
    pendingCount: result.reduce(function(total, group) { return total + group.pendingCount; }, 0),
    processingCount: result.reduce(function(total, group) { return total + group.processingCount; }, 0),
    groups: result
  };
}

function installAdminWorkSummaryReminder() {
  const identity = assertAdmin_();
  if (normalizeEmail_(identity.email) !== normalizeEmail_(APP.DEFAULT_ADMIN)) {
    throw new Error('ADMIN_ONLY|Chỉ chủ sở hữu hệ thống mới có thể cài nhắc email hằng ngày.');
  }
  const handler = 'sendAdminWorkSummaryReminder';
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === handler) ScriptApp.deleteTrigger(trigger);
  });
  const trigger = ScriptApp.newTrigger(handler).timeBased().atHour(7).nearMinute(30).everyDays(1).inTimezone(APP.TIMEZONE).create();
  PropertiesService.getScriptProperties().setProperty('ADMIN_WORK_SUMMARY_TRIGGER_UID', trigger.getUniqueId());
  return { ok: true, recipient: APP.DEFAULT_ADMIN, hour: 7, timezone: APP.TIMEZONE };
}

function sendAdminWorkSummaryReminder(event) {
  const expectedTriggerUid = PropertiesService.getScriptProperties().getProperty('ADMIN_WORK_SUMMARY_TRIGGER_UID');
  if (!expectedTriggerUid || !event || String(event.triggerUid) !== expectedTriggerUid) {
    throw new Error('TRIGGER_ONLY|Email nhắc việc chỉ được gửi từ trigger đã cài đặt.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const now = new Date();
    const dayKey = Utilities.formatDate(now, APP.TIMEZONE, 'yyyy-MM-dd');
    const propertyKey = 'ADMIN_WORK_SUMMARY_LAST_SENT_DATE';
    if (properties.getProperty(propertyKey) === dayKey) return { sent: false, reason: 'ALREADY_SENT', day: dayKey };
    const content = buildAdminWorkSummaryReminder_(buildAdminWorkSummary_(), now);
    MailApp.sendEmail({
      to: APP.DEFAULT_ADMIN, subject: content.subject, body: content.body, htmlBody: content.htmlBody
    });
    properties.setProperty(propertyKey, dayKey);
    return { sent: true, recipient: APP.DEFAULT_ADMIN, day: dayKey };
  } finally {
    lock.releaseLock();
  }
}

function buildAdminWorkSummaryReminder_(summary, date) {
  const dateLabel = Utilities.formatDate(date, APP.TIMEZONE, 'dd/MM/yyyy');
  const sourceLabels = {REQUEST:'Yêu cầu cấp hồ sơ',SUBMIT:'Nộp hồ sơ',RECEIVE:'Nhận hồ sơ',SUPPLEMENT:'Bổ sung giấy tờ',DOCUMENT:'Hồ sơ'};
  function itemDescription(item) {
    const source = sourceLabels[item.source] || sourceLabels.DOCUMENT;
    const codeLabel = item.source === 'DOCUMENT' ? 'Mã hồ sơ' : 'Mã yêu cầu';
    const pieces = [
      item.studentName || 'Chưa có họ tên', 'MSSV ' + (item.studentId || '—'), 'Lớp ' + (item.className || '—'),
      source, codeLabel + ' ' + (item.code || '—'), 'Trạng thái ' + (item.status || '—')
    ];
    if (item.secondaryCode) pieces.push('Mã hồ sơ ' + item.secondaryCode);
    if (Number(item.copyCount || 0)) pieces.push('Số bản ' + Number(item.copyCount));
    if (item.expectedAt) pieces.push('Dự kiến ' + Utilities.formatDate(dateValue_(item.expectedAt), APP.TIMEZONE, 'dd/MM/yyyy'));
    return pieces.join(' | ');
  }
  const groups = summary.groups || [];
  const textLines = [
    'Nhắc hồ sơ cần xử lý và đang xử lý', 'Ngày ' + dateLabel, '',
    'Cần xử lý: ' + Number(summary.pendingCount || 0),
    'Đang xử lý: ' + Number(summary.processingCount || 0), ''
  ];
  if (!groups.length) textLines.push('Hiện không có hồ sơ cần xử lý hoặc đang xử lý.');
  groups.forEach(function(group) {
    textLines.push(group.typeName + ' (' + group.items.length + ')');
    group.items.forEach(function(item) { textLines.push('- ' + itemDescription(item)); });
    textLines.push('');
  });
  const groupHtml = groups.map(function(group) {
    const items = group.items.map(function(item) {
      return '<li style="margin:0 0 10px;padding:12px;border:1px solid #e7e8ef;border-radius:10px">' +
        '<strong>' + escapeHtml_(item.studentName || 'Chưa có họ tên') + '</strong>' +
        '<div style="margin-top:5px;color:#475569;font-size:13px">' + escapeHtml_(itemDescription(item)) + '</div></li>';
    }).join('');
    return '<section style="margin-top:20px"><h3 style="margin:0 0 10px;font-size:16px">' +
      escapeHtml_(group.typeName) + ' <span style="color:#64748b;font-weight:400">(' + group.items.length + ')</span></h3>' +
      '<ul style="margin:0;padding:0;list-style:none">' + items + '</ul></section>';
  }).join('');
  const noWorkHtml = groups.length ? '' : '<p>Hiện không có hồ sơ cần xử lý hoặc đang xử lý.</p>';
  return {
    subject: 'Nhắc hồ sơ cần xử lý – ' + dateLabel,
    body: textLines.join('\n'),
    htmlBody: '<div style="font-family:Arial,sans-serif;line-height:1.55;color:#172033;max-width:760px">' +
      '<h2 style="margin:0 0 4px;font-size:20px">Nhắc hồ sơ cần xử lý và đang xử lý</h2>' +
      '<p style="margin:0 0 16px;color:#64748b">Ngày ' + dateLabel + '</p>' +
      '<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:8px 0"><tr>' +
      '<td style="padding:12px;border-radius:10px;background:#fff0f7"><strong>Cần xử lý: ' + Number(summary.pendingCount || 0) + '</strong></td>' +
      '<td style="padding:12px;border-radius:10px;background:#eef1ff"><strong>Đang xử lý: ' + Number(summary.processingCount || 0) + '</strong></td>' +
      '</tr></table>' + groupHtml + noWorkHtml + '<p style="margin-top:24px;color:#64748b;font-size:12px">Sổ giao nhận hồ sơ</p></div>'
  };
}

function reviewTransactionItem(payload) {
  payload = payload || {};
  return reviewTransactionItems({
    itemIds: [payload.itemId],
    decision: payload.decision,
    note: payload.note,
    sendEmail: payload.sendEmail,
    messageBody: payload.messageBody,
    documentSelections: payload.documentId ? (function() { const result = {}; result[payload.itemId] = payload.documentId; return result; })() : {}
  });
}

function reviewTransactionItems(payload) {
  const admin = assertAdmin_();
  payload = payload || {};
  const decision = String(payload.decision || '').toUpperCase();
  if (['APPROVE', 'REJECT'].indexOf(decision) === -1) throw new Error('VALIDATION|Quyết định duyệt không hợp lệ.');
  const note = sanitizeText_(payload.note, 1000);
  const messageBody = sanitizeNotificationBody_(payload.messageBody);
  if (decision === 'REJECT' && !note) throw new Error('VALIDATION|Ghi lý do từ chối.');
  const itemIds = Array.isArray(payload.itemIds) ? payload.itemIds.map(sanitizeId_).filter(Boolean) : [];
  const uniqueIds = itemIds.filter(function(id, index) { return itemIds.indexOf(id) === index; });
  if (!uniqueIds.length || uniqueIds.length > 20) throw new Error('VALIDATION|Chọn từ 1 đến 20 giấy tờ.');
  const selections = payload.documentSelections || {};

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const now = new Date();
    const items = uniqueIds.map(function(itemId) {
      const item = findBy_(APP.SHEETS.ITEMS, 'item_id', itemId);
      if (!item) throw new Error('NOT_FOUND|Không tìm thấy mục yêu cầu ' + itemId + '.');
      return item;
    });
    const transactionId = items[0].transaction_id;
    if (items.some(function(item) { return item.transaction_id !== transactionId; })) {
      throw new Error('VALIDATION|Chỉ có thể xác nhận các giấy tờ trong cùng một yêu cầu.');
    }
    const transaction = findBy_(APP.SHEETS.TRANSACTIONS, 'transaction_id', transactionId);
    if (!transaction) throw new Error('DATA_ERROR|Không tìm thấy yêu cầu tương ứng.');
    const templateKey = decision === 'APPROVE' ? 'transactionApprove' : 'transactionReject';
    items.forEach(function(item) {
      const selectedDocument = selections[item.item_id] ? findBy_(APP.SHEETS.DOCUMENTS, 'document_id', sanitizeId_(selections[item.item_id])) : null;
      const related = selectedDocument || findBy_(APP.SHEETS.DOCUMENTS, 'document_id', item.document_id || item.related_document_id);
      const student = {student_id: transaction.student_id, student_email: transaction.student_email, student_name: transaction.student_name, class_name: transaction.class_name};
      const fields = {typeName: related ? related.type_name : item.type_name, documentCode: related ? related.document_code : 'HS-00000000-000000-000', requestCode: transaction.transaction_code, status: decision === 'APPROVE' ? 'Đã xác nhận' : 'Chưa được xác nhận', publicNote: note};
      compileNotificationMessage_(messageBody, '', templateKey, student, fields, fields.typeName);
    });
    items.forEach(function(item) {
      processTransactionItem_(transaction, item, decision, note, sanitizeId_(selections[item.item_id]), admin.email, now, toBoolean_(payload.sendEmail), messageBody, templateKey);
    });
    refreshTransactionStatus_(transactionId, admin.email);
    audit_('REVIEW_TRANSACTION_ITEMS', 'Transaction', transactionId, admin.email, { decision: decision, itemIds: uniqueIds });
    return getTransactionResult_(transactionId, '', true);
  } finally {
    lock.releaseLock();
  }
}

function processTransactionItem_(transaction, item, decision, note, selectedDocumentId, adminEmail, now, sendEmail, messageBody, templateKey) {
  const currentStatus = String(item.status);
  const expectedStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  if (currentStatus === expectedStatus) return;
  if (currentStatus !== 'PENDING') throw new Error('ALREADY_REVIEWED|Mục ' + item.type_name + ' đã được xử lý với kết quả khác.');
  let documentId = item.document_id || '';
  if (decision === 'APPROVE') {
    if (transaction.transaction_type === 'SUBMIT') {
      documentId = createDocumentFromItem_(transaction, item, adminEmail, now).document_id;
    } else if (transaction.transaction_type === 'SUPPLEMENT') {
      const eventId = 'evt_sup_' + item.item_id;
      const publicNote = note || 'Văn phòng đã nhận giấy tờ bổ sung.';
      if (!findBy_(APP.SHEETS.EVENTS, 'event_id', eventId)) {
        appendRecord_(APP.SHEETS.EVENTS, {
          event_id: eventId, document_id: item.related_document_id, event_type: 'SUPPLEMENT_RECEIVED',
          from_step_id: '', to_step_id: '', status: 'Đã nhận bổ sung',
          public_note: publicNote, internal_note: '', created_at: now, created_by: adminEmail
        });
      }
      const related = findBy_(APP.SHEETS.DOCUMENTS, 'document_id', item.related_document_id);
      if (!related) throw new Error('NOT_FOUND|Không tìm thấy hồ sơ cần bổ sung.');
      if (String(related.public_note || '') !== publicNote) touchDocument_(item.related_document_id, adminEmail, publicNote);
    } else if (transaction.transaction_type === 'RECEIVE') {
      documentId = resolvePickupDocument_(transaction, item, selectedDocumentId, adminEmail, now, note).document_id;
    }
  }
  updateRow_(APP.SHEETS.ITEMS, item._row, {
    status: expectedStatus, admin_note: note, document_id: documentId,
    reviewed_at: now, reviewed_by: adminEmail
  });
  const relatedDocument = findBy_(APP.SHEETS.DOCUMENTS, 'document_id', documentId || item.related_document_id);
  const typeName = relatedDocument ? relatedDocument.type_name : item.type_name;
  const title = typeName || item.type_name || (decision === 'APPROVE' ? 'Yêu cầu đã được xác nhận' : 'Có giấy tờ chưa được xác nhận');
  const names = notificationTypeNames_(relatedDocument ? relatedDocument.type_id : item.type_id, typeName);
  const compiled = compileNotificationMessage_(messageBody, '', templateKey || (decision === 'APPROVE' ? 'transactionApprove' : 'transactionReject'), transaction, {
    typeName: typeName || item.type_name, documentCode: relatedDocument ? relatedDocument.document_code : '',
    requestCode: transaction.transaction_code, status: decision === 'APPROVE' ? 'Đã xác nhận' : 'Chưa được xác nhận', publicNote: note
  }, title, {loai_ho_so: names.en});
  const message = compiled.body || (item.type_name + (note ? ': ' + note : (decision === 'APPROVE' ? ' đã xác nhận tại quầy.' : ' chưa được xác nhận.')));
  const i18n = {
    titleKey: 'documentTypeTitle',
    messageKey: note ? 'documentReviewNote' : (decision === 'APPROVE' ? 'documentConfirmed' : 'documentNotConfirmed'),
    messageEn: compiled.messageEn,
    params: { nameVi: names.vi, nameEn: names.en, note: note },
    customMessage: !!messageBody && !compiled.bodyIsDefault
  };
  notify_(transaction.student_email, documentId || item.related_document_id, title, message, adminEmail, sendEmail, i18n);
}

function createDocumentFromItem_(transaction, item, adminEmail, now) {
  const deterministicId = 'doc_submit_' + item.item_id;
  const existing = findBy_(APP.SHEETS.DOCUMENTS, 'document_id', deterministicId);
  const eventId = 'evt_submit_' + item.item_id;
  if (existing) {
    if (!findBy_(APP.SHEETS.EVENTS, 'event_id', eventId)) {
      appendRecord_(APP.SHEETS.EVENTS, {
        event_id: eventId, document_id: existing.document_id, event_type: 'RECEIVED',
        from_step_id: '', to_step_id: existing.current_step_id, status: existing.status,
        public_note: existing.public_note, internal_note: '', created_at: now, created_by: adminEmail
      });
    }
    return existing;
  }
  const type = findBy_(APP.SHEETS.TYPES, 'type_id', item.type_id);
  if (!type) throw new Error('DATA_ERROR|Không tìm thấy loại hồ sơ.');
  const steps = getWorkflowSteps_(type.workflow_version_id);
  const first = steps.length ? steps[0] : null;
  const document = {
    document_id: deterministicId,
    document_code: makeCode_('HS'),
    student_id: transaction.student_id,
    student_email: transaction.student_email,
    student_name: transaction.student_name,
    class_name: transaction.class_name,
    type_id: type.type_id,
    type_name: type.name,
    workflow_version_id: type.workflow_version_id || '',
    current_step_id: first ? first.step_id : '',
    current_step_order: first ? Number(first.step_order) : 0,
    status: first ? (first.status_label || 'Đã tiếp nhận') : 'Đã tiếp nhận',
    storage_status: 'AT_OFFICE',
    submitted_at: now,
    expected_at: '',
    updated_at: now,
    updated_by: adminEmail,
    public_note: 'Văn phòng đã tiếp nhận hồ sơ.',
    internal_note: '',
    version: 1,
    active: true
  };
  appendRecord_(APP.SHEETS.DOCUMENTS, document);
  appendRecord_(APP.SHEETS.EVENTS, {
    event_id: eventId, document_id: document.document_id, event_type: 'RECEIVED',
    from_step_id: '', to_step_id: document.current_step_id, status: document.status,
    public_note: document.public_note, internal_note: '', created_at: now, created_by: adminEmail
  });
  return document;
}

function resolvePickupDocument_(transaction, item, selectedDocumentId, adminEmail, now, note) {
  const candidates = readTable_(APP.SHEETS.DOCUMENTS).filter(function(row) {
    return normalizeEmail_(row.student_email) === normalizeEmail_(transaction.student_email) &&
      row.type_id === item.type_id && String(row.status) === 'Chờ sinh viên đến nhận' && toBoolean_(row.active);
  });
  let document = null;
  if (item.document_id) document = candidates.find(function(row) { return row.document_id === item.document_id; }) || findBy_(APP.SHEETS.DOCUMENTS, 'document_id', item.document_id);
  else if (selectedDocumentId) document = candidates.find(function(row) { return row.document_id === selectedDocumentId; }) || null;
  else if (candidates.length === 1) document = candidates[0];
  else if (candidates.length > 1) throw new Error('VALIDATION|Có nhiều hồ sơ ' + item.type_name + ' đang chờ nhận. Chọn đúng hồ sơ.');
  if (selectedDocumentId && !document) throw new Error('VALIDATION|Hồ sơ được chọn không còn phù hợp để bàn giao.');
  if (document) {
    handOverDocument_(document.document_id, adminEmail, note, 'evt_handover_' + item.item_id);
    return findBy_(APP.SHEETS.DOCUMENTS, 'document_id', document.document_id);
  }
  return createDirectPickupDocument_(transaction, item, adminEmail, now, note);
}

function createDirectPickupDocument_(transaction, item, adminEmail, now, note) {
  const documentId = 'doc_pickup_' + item.item_id;
  const existing = findBy_(APP.SHEETS.DOCUMENTS, 'document_id', documentId);
  const eventId = 'evt_pickup_' + item.item_id;
  if (existing) {
    if (!findBy_(APP.SHEETS.EVENTS, 'event_id', eventId)) {
      appendRecord_(APP.SHEETS.EVENTS, {
        event_id: eventId, document_id: documentId, event_type: 'HANDED_OVER_DIRECT',
        from_step_id: '', to_step_id: '', status: 'Đã bàn giao', public_note: existing.public_note,
        internal_note: '', created_at: now, created_by: adminEmail
      });
    }
    return existing;
  }
  const type = findBy_(APP.SHEETS.TYPES, 'type_id', item.type_id);
  if (!type) throw new Error('DATA_ERROR|Không tìm thấy loại hồ sơ.');
  const publicNote = note || 'Hồ sơ đã được bàn giao trực tiếp cho sinh viên tại văn phòng.';
  const document = {
    document_id: documentId, document_code: makeCode_('HS'), student_id: transaction.student_id,
    student_email: transaction.student_email, student_name: transaction.student_name, class_name: transaction.class_name,
    type_id: type.type_id, type_name: type.name, workflow_version_id: '', current_step_id: '', current_step_order: 0,
    status: 'Đã bàn giao', storage_status: 'HANDED_OVER', submitted_at: now, expected_at: '', updated_at: now,
    updated_by: adminEmail, public_note: publicNote, internal_note: '', version: 1, active: true
  };
  appendRecord_(APP.SHEETS.DOCUMENTS, document);
  appendRecord_(APP.SHEETS.EVENTS, {
    event_id: eventId, document_id: documentId, event_type: 'HANDED_OVER_DIRECT',
    from_step_id: '', to_step_id: '', status: 'Đã bàn giao', public_note: publicNote,
    internal_note: '', created_at: now, created_by: adminEmail
  });
  return document;
}

function handOverDocument_(documentId, adminEmail, note, eventId, skipRequestSync) {
  const document = findBy_(APP.SHEETS.DOCUMENTS, 'document_id', documentId);
  if (!document) throw new Error('NOT_FOUND|Không tìm thấy hồ sơ.');
  eventId = eventId || ('evt_handover_' + shortId_());
  const existingEvent = findBy_(APP.SHEETS.EVENTS, 'event_id', eventId);
  if (existingEvent) {
    if (String(document.status) !== 'Đã bàn giao') {
      updateRow_(APP.SHEETS.DOCUMENTS, document._row, {
        status: 'Đã bàn giao', storage_status: 'HANDED_OVER', updated_at: existingEvent.created_at || new Date(),
        updated_by: adminEmail, public_note: existingEvent.public_note || note || 'Hồ sơ đã được bàn giao cho sinh viên.', version: Number(document.version || 0) + 1
      });
    }
    completePendingPickupTransactions_(document, adminEmail);
    if (!skipRequestSync) syncDocumentRequestFromDocument_(document, 'Đã bàn giao', note, adminEmail);
    return document;
  }
  if (String(document.status) !== 'Chờ sinh viên đến nhận') {
    throw new Error('VALIDATION|Hồ sơ ' + document.document_code + ' không còn ở trạng thái chờ nhận.');
  }
  const now = new Date();
  appendRecord_(APP.SHEETS.EVENTS, {
    event_id: eventId, document_id: documentId, event_type: 'HANDED_OVER',
    from_step_id: document.current_step_id, to_step_id: document.current_step_id, status: 'Đã bàn giao',
    public_note: note || 'Hồ sơ đã được bàn giao cho sinh viên.', internal_note: '', created_at: now, created_by: adminEmail
  });
  updateRow_(APP.SHEETS.DOCUMENTS, document._row, {
    status: 'Đã bàn giao', storage_status: 'HANDED_OVER', updated_at: now,
    updated_by: adminEmail, public_note: note || 'Hồ sơ đã được bàn giao cho sinh viên.', version: Number(document.version || 0) + 1
  });
  completePendingPickupTransactions_(document, adminEmail);
  if (!skipRequestSync) syncDocumentRequestFromDocument_(document, 'Đã bàn giao', note, adminEmail);
  return document;
}

function completePendingPickupTransactions_(document, adminEmail) {
  updatePendingPickupTransactions_(document, adminEmail, 'APPROVED', 'Hồ sơ đã được bàn giao.');
}

function rejectPendingPickupTransactions_(document, adminEmail, note) {
  updatePendingPickupTransactions_(document, adminEmail, 'REJECTED', note || 'Yêu cầu cấp hồ sơ đã bị hủy.');
}

function updatePendingPickupTransactions_(document, adminEmail, status, note) {
  if (!document || !document.request_id) return;
  const matching = readTable_(APP.SHEETS.ITEMS).filter(function(item) {
    if (item.document_id !== document.document_id || String(item.status) !== 'PENDING') return false;
    const transaction = findBy_(APP.SHEETS.TRANSACTIONS, 'transaction_id', item.transaction_id);
    return transaction && transaction.transaction_type === 'RECEIVE' && ['PENDING', 'PARTIAL'].indexOf(String(transaction.status)) !== -1;
  });
  const transactionIds = [];
  const now = new Date();
  matching.forEach(function(item) {
    updateRow_(APP.SHEETS.ITEMS, item._row, { status: status, document_id: document.document_id, reviewed_at: now, reviewed_by: adminEmail, admin_note: note });
    if (transactionIds.indexOf(item.transaction_id) === -1) transactionIds.push(item.transaction_id);
  });
  transactionIds.forEach(function(id) { refreshTransactionStatus_(id, adminEmail); });
}

function syncDocumentRequestFromDocument_(document, documentStatus, note, actorEmail) {
  if (!document || !document.request_id) return;
  const request = findBy_(APP.SHEETS.REQUESTS, 'request_id', document.request_id);
  if (!request || !OPEN_DOCUMENT_REQUEST_STATUSES_.includes(String(request.status))) return;
  const next = documentStatus === 'Đã bàn giao' ? 'COMPLETED' : (documentStatus === 'Đã hủy' ? 'CANCELLED' : '');
  if (!next) return;
  const actionToken = 'doc_' + document.document_id + '_' + next;
  if (readTable_(APP.SHEETS.REQUEST_EVENTS).some(function(row) { return row.action_token === actionToken; })) return;
  const from = String(request.status);
  const now = new Date();
  const publicNote = sanitizeText_(note, 1500) || (next === 'COMPLETED' ? 'Hồ sơ đã được bàn giao tại văn phòng.' : 'Hồ sơ liên kết đã bị hủy.');
  updateRow_(APP.SHEETS.REQUESTS, request._row, { status: next, public_note: publicNote, updated_at: now, updated_by: actorEmail, version: Number(request.version || 0) + 1 });
  const updated = Object.assign({}, request, { status: next, public_note: publicNote });
  appendDocumentRequestEvent_(updated, from, next, publicNote, '', actorEmail, actionToken);
  notify_(request.student_email, document.document_id, request.type_name, publicNote, actorEmail, false, null, request.request_id);
  audit_('SYNC_DOCUMENT_REQUEST', 'DocumentRequest', request.request_id, actorEmail, { documentId: document.document_id, status: next });
}

function getMyDocuments() {
  const identity = assertStudent_();
  return readTable_(APP.SHEETS.DOCUMENTS).filter(function(row) {
    return normalizeEmail_(row.student_email) === identity.email && toBoolean_(row.active);
  }).sort(sortDesc_('updated_at')).map(publicDocument_);
}

function getDocumentDetail(documentId) {
  const identity = getIdentity_();
  const document = findBy_(APP.SHEETS.DOCUMENTS, 'document_id', sanitizeId_(documentId));
  if (!document || !toBoolean_(document.active)) throw new Error('NOT_FOUND|Không tìm thấy hồ sơ.');
  if (identity.role !== 'ADMIN' && normalizeEmail_(document.student_email) !== identity.email) {
    throw new Error('ACCESS_DENIED|Bạn không có quyền xem hồ sơ này.');
  }
  const events = readTable_(APP.SHEETS.EVENTS).filter(function(row) { return row.document_id === document.document_id; })
    .sort(sortAsc_('created_at'));
  const steps = getWorkflowSteps_(document.workflow_version_id);
  const result = publicDocument_(document);
  result.steps = steps.map(function(step) {
    const order = Number(step.step_order || 0);
    return {
      stepId: step.step_id, order: order, name: step.name, nameEn: step.name_en || '', statusLabel: step.status_label, statusLabelEn: step.status_label_en || '',
      state: order < Number(document.current_step_order || 0) ? 'DONE' : order === Number(document.current_step_order || 0) ? 'CURRENT' : 'UPCOMING'
    };
  });
  result.events = events.map(function(event) {
    const publicEvent = publicEvent_(event, identity.role === 'ADMIN');
    const step = steps.find(function(item) { return item.step_id === event.to_step_id || item.status_label === event.status; });
    if (step) publicEvent.statusEn = step.status_label_en || '';
    return publicEvent;
  });
  if (identity.role === 'ADMIN') result.internalNote = document.internal_note || '';
  return result;
}

function listDocuments(filters) {
  assertAdmin_();
  filters = filters || {};
  const query = String(filters.query || '').trim().toLowerCase();
  const status = String(filters.status || '').trim();
  const typeId = sanitizeId_(filters.typeId);
  return readTable_(APP.SHEETS.DOCUMENTS).filter(function(row) {
    if (!toBoolean_(row.active)) return false;
    if (status && String(row.status) !== status) return false;
    if (typeId && row.type_id !== typeId) return false;
    if (!query) return true;
    return [row.document_code, row.student_id, row.student_email, row.student_name, row.type_name]
      .some(function(value) { return String(value || '').toLowerCase().indexOf(query) !== -1; });
  }).sort(sortDesc_('updated_at')).slice(0, 500).map(publicDocumentAdmin_);
}

function createManualDocument(payload) {
  const admin = assertAdmin_();
  payload = payload || {};
  const student = resolveStudent_(payload);
  const messageBody = sanitizeNotificationBody_(payload.messageBody);
  const type = findBy_(APP.SHEETS.TYPES, 'type_id', sanitizeId_(payload.typeId));
  if (!type || !toBoolean_(type.active)) throw new Error('VALIDATION|Loại hồ sơ không hợp lệ.');
  const now = new Date();
  const steps = getWorkflowSteps_(type.workflow_version_id);
  const first = steps.length ? steps[0] : null;
  const status = sanitizeText_(payload.status, 120) || (first ? first.status_label : 'Đã tiếp nhận');
  const document = {
    document_id: 'doc_' + shortId_(), document_code: makeCode_('HS'), student_id: student.student_id,
    student_email: student.email, student_name: student.full_name, class_name: student.class_name,
    type_id: type.type_id, type_name: type.name, workflow_version_id: type.workflow_version_id || '',
    current_step_id: first ? first.step_id : '', current_step_order: first ? Number(first.step_order) : 0,
    status: status, storage_status: status === 'Đã bàn giao' ? 'HANDED_OVER' : 'AT_OFFICE', submitted_at: now,
    expected_at: parseDateInput_(payload.expectedAt) || '', updated_at: now, updated_by: admin.email,
    public_note: sanitizeText_(payload.publicNote, 1500) || 'Hồ sơ được văn phòng ghi nhận trực tiếp.',
    internal_note: sanitizeText_(payload.internalNote, 1500), version: 1, active: true
  };
  const content = documentNotificationContent_(document, status, first, document.public_note, messageBody, 'documentCreated', parseDateInput_(payload.expectedAt));
  appendRecord_(APP.SHEETS.DOCUMENTS, document);
  appendRecord_(APP.SHEETS.EVENTS, { event_id: 'evt_' + shortId_(), document_id: document.document_id, event_type: 'MANUAL_CREATED', from_step_id: '', to_step_id: document.current_step_id, status: status, public_note: document.public_note, internal_note: document.internal_note, created_at: now, created_by: admin.email });
  audit_('CREATE_MANUAL_DOCUMENT', 'Document', document.document_id, admin.email, { studentId: student.student_id, typeId: type.type_id });
  notify_(student.email, document.document_id, content.title, content.message, admin.email, toBoolean_(payload.sendEmail), content.i18n);
  return publicDocumentAdmin_(document);
}

function batchUpdateDocuments(payload) {
  const admin = assertAdmin_();
  payload = payload || {};
  const ids = Array.isArray(payload.documentIds) ? payload.documentIds.map(sanitizeId_).filter(Boolean) : [];
  if (!ids.length || ids.length > 100) throw new Error('VALIDATION|Chọn từ 1 đến 100 hồ sơ để cập nhật.');
  const status = sanitizeText_(payload.status, 120);
  if (!status) throw new Error('VALIDATION|Chọn trạng thái mới.');
  const note = sanitizeText_(payload.publicNote, 1500);
  const messageBody = sanitizeNotificationBody_(payload.messageBody);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const now = new Date();
    ids.forEach(function(id) {
      const document = findBy_(APP.SHEETS.DOCUMENTS, 'document_id', id);
      if (document && document.request_id && toBoolean_(document.active)) throw new Error('VALIDATION|Cập nhật hồ sơ được cấp từ mục Yêu cầu sinh viên để giữ đồng bộ trạng thái.');
    });
    ids.forEach(function(id) {
      const document = findBy_(APP.SHEETS.DOCUMENTS, 'document_id', id);
      if (!document || !toBoolean_(document.active)) return;
      const step = document.current_step_id ? getWorkflowSteps_(document.workflow_version_id).find(function(item) { return item.step_id === document.current_step_id; }) : null;
      compileNotificationMessage_(messageBody, '', 'documentBatch', document, {
        typeName: document.type_name, documentCode: document.document_code, status: status,
        expectedAt: document.expected_at, workflow: workflowName_(document.workflow_version_id),
        step: step ? (step.name || step.status_label) : '', publicNote: note || document.public_note
      }, document.type_name);
    });
    ids.forEach(function(id) {
      const document = findBy_(APP.SHEETS.DOCUMENTS, 'document_id', id);
      if (!document || !toBoolean_(document.active)) return;
      updateRow_(APP.SHEETS.DOCUMENTS, document._row, { status: status, public_note: note || document.public_note, storage_status: status === 'Đã bàn giao' ? 'HANDED_OVER' : document.storage_status, updated_at: now, updated_by: admin.email, version: Number(document.version || 0) + 1 });
      appendRecord_(APP.SHEETS.EVENTS, { event_id: 'evt_' + shortId_(), document_id: id, event_type: 'BATCH_UPDATED', from_step_id: document.current_step_id, to_step_id: document.current_step_id, status: status, public_note: note, internal_note: '', created_at: now, created_by: admin.email });
      const step = document.current_step_id ? getWorkflowSteps_(document.workflow_version_id).find(function(item) { return item.step_id === document.current_step_id; }) : null;
      const content = documentNotificationContent_(document, status, step, note || document.public_note, messageBody, 'documentBatch', document.expected_at);
      notify_(document.student_email, id, content.title, content.message, admin.email, toBoolean_(payload.sendEmail), content.i18n);
    });
    audit_('BATCH_UPDATE_DOCUMENTS', 'Document', ids.join(','), admin.email, { count: ids.length, status: status });
    return { ok: true, updated: ids.length };
  } finally {
    lock.releaseLock();
  }
}

function updateDocumentProgress(payload) {
  const admin = assertAdmin_();
  payload = payload || {};
  const documentId = sanitizeId_(payload.documentId);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const document = findBy_(APP.SHEETS.DOCUMENTS, 'document_id', documentId);
    if (!document) throw new Error('NOT_FOUND|Không tìm thấy hồ sơ.');
    if (document.request_id) throw new Error('VALIDATION|Cập nhật hồ sơ được cấp từ mục Yêu cầu sinh viên để giữ đồng bộ trạng thái.');
    if (payload.version != null && Number(payload.version) !== Number(document.version || 0)) {
      throw new Error('VERSION_CONFLICT|Hồ sơ vừa được người khác cập nhật. Tải lại để xem bản mới.');
    }
    const steps = getWorkflowSteps_(document.workflow_version_id);
    const rawStepId = String(payload.stepId || '').trim();
    const stepId = sanitizeId_(rawStepId);
    if (rawStepId && !stepId) throw new Error('VALIDATION|Bước xử lý không thuộc quy trình của hồ sơ.');
    const step = stepId ? steps.find(function(row) { return row.step_id === stepId; }) : null;
    if (stepId && !step) throw new Error('VALIDATION|Bước xử lý không thuộc quy trình của hồ sơ.');
    const explicitStatus = sanitizeText_(payload.status, 120);
    const statusOverride = toBoolean_(payload.overrideStepStatus);
    const status = step && !statusOverride ? step.status_label : (explicitStatus || (step ? step.status_label : document.status));
    const publicNote = sanitizeText_(payload.publicNote, 1500);
    const internalNote = sanitizeText_(payload.internalNote, 1500);
    const messageBody = sanitizeNotificationBody_(payload.messageBody);
    const expectedAt = parseDateInput_(payload.expectedAt);
    const content = documentNotificationContent_(document, status, step || steps.find(function(item) { return item.step_id === document.current_step_id; }), publicNote || document.public_note, messageBody, 'documentProgress', expectedAt || document.expected_at);
    const now = new Date();
    updateRow_(APP.SHEETS.DOCUMENTS, document._row, {
      current_step_id: step ? step.step_id : document.current_step_id,
      current_step_order: step ? Number(step.step_order) : document.current_step_order,
      status: status,
      storage_status: status === 'Đã bàn giao' ? 'HANDED_OVER' : document.storage_status,
      expected_at: expectedAt || document.expected_at,
      updated_at: now,
      updated_by: admin.email,
      public_note: publicNote || document.public_note,
      internal_note: internalNote || document.internal_note,
      version: Number(document.version || 0) + 1
    });
    appendRecord_(APP.SHEETS.EVENTS, {
      event_id: 'evt_' + shortId_(), document_id: documentId, event_type: 'PROGRESS_UPDATED',
      from_step_id: document.current_step_id, to_step_id: step ? step.step_id : document.current_step_id,
      status: status, public_note: publicNote, internal_note: internalNote, created_at: now, created_by: admin.email
    });
    notify_(document.student_email, documentId, content.title, content.message, admin.email, toBoolean_(payload.sendEmail), content.i18n);
    audit_('UPDATE_DOCUMENT_PROGRESS', 'Document', documentId, admin.email, { status: status, stepId: step ? step.step_id : '' });
    return getDocumentDetail(documentId);
  } finally {
    lock.releaseLock();
  }
}

function cancelDocument(payload) {
  const admin = assertAdmin_();
  payload = payload || {};
  const document = findBy_(APP.SHEETS.DOCUMENTS, 'document_id', sanitizeId_(payload.documentId));
  if (!document) throw new Error('NOT_FOUND|Không tìm thấy hồ sơ.');
  if (document.request_id) throw new Error('VALIDATION|Hủy hồ sơ được cấp từ mục Yêu cầu sinh viên để giữ đồng bộ trạng thái.');
  const reason = sanitizeText_(payload.reason, 1000);
  if (!reason) throw new Error('VALIDATION|Nhập lý do hủy hồ sơ.');
  const messageBody = sanitizeNotificationBody_(payload.messageBody);
  const content = documentNotificationContent_(document, 'Đã hủy', null, reason, messageBody, 'documentCancel', document.expected_at);
  const now = new Date();
  updateRow_(APP.SHEETS.DOCUMENTS, document._row, { status: 'Đã hủy', active: false, public_note: reason, updated_at: now, updated_by: admin.email, version: Number(document.version || 0) + 1 });
  appendRecord_(APP.SHEETS.EVENTS, { event_id: 'evt_' + shortId_(), document_id: document.document_id, event_type: 'CANCELLED', from_step_id: document.current_step_id, to_step_id: document.current_step_id, status: 'Đã hủy', public_note: reason, internal_note: '', created_at: now, created_by: admin.email });
  const message = content.message || reason;
  notify_(document.student_email, document.document_id, content.title || document.type_name, message, admin.email, toBoolean_(payload.sendEmail), content.i18n);
  audit_('CANCEL_DOCUMENT', 'Document', document.document_id, admin.email, { reason: reason });
  syncDocumentRequestFromDocument_(document, 'Đã hủy', reason, admin.email);
  return { ok: true };
}

function listWorkflows() {
  assertAdmin_();
  const versions = readTable_(APP.SHEETS.WORKFLOW_VERSIONS);
  return versions.map(function(version) {
    return {
      workflowVersionId: version.workflow_version_id,
      name: version.name,
      nameEn: version.name_en || '',
      version: Number(version.version || 1),
      active: toBoolean_(version.active),
      steps: getWorkflowSteps_(version.workflow_version_id).map(function(step) {
        return { stepId: step.step_id, order: Number(step.step_order), name: step.name, nameEn: step.name_en || '', statusLabel: step.status_label, statusLabelEn: step.status_label_en || '' };
      })
    };
  });
}

function saveWorkflow(payload) {
  const admin = assertAdmin_();
  payload = payload || {};
  const name = sanitizeText_(payload.name, 160);
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  if (!name || !steps.length) throw new Error('VALIDATION|Quy trình phải có tên và ít nhất một bước.');
  const now = new Date();
  const workflowId = 'wf_' + shortId_();
  appendRecord_(APP.SHEETS.WORKFLOW_VERSIONS, { workflow_version_id: workflowId, name: name, name_en: sanitizeText_(payload.nameEn, 160), version: Number(payload.version || 1), active: true, created_at: now, created_by: admin.email });
  steps.forEach(function(item, index) {
    const stepName = sanitizeText_(item.name, 160);
    if (!stepName) throw new Error('VALIDATION|Tên bước xử lý không được để trống.');
    appendRecord_(APP.SHEETS.WORKFLOW_STEPS, { step_id: workflowId + '_s' + (index + 1), workflow_version_id: workflowId, step_order: index + 1, name: stepName, name_en: sanitizeText_(item.nameEn, 160), status_label: sanitizeText_(item.statusLabel, 120) || stepName, status_label_en: sanitizeText_(item.statusLabelEn, 120), created_at: now });
  });
  audit_('CREATE_WORKFLOW', 'WorkflowVersion', workflowId, admin.email, { name: name, stepCount: steps.length });
  return listWorkflows();
}

function listStudents(query) {
  assertAdmin_();
  query = String(query || '').trim().toLowerCase();
  return readTable_(APP.SHEETS.STUDENTS).filter(function(row) {
    if (!query) return true;
    return [row.student_id, row.email, row.full_name, row.class_name].some(function(value) {
      return String(value || '').toLowerCase().indexOf(query) !== -1;
    });
  }).sort(sortAsc_('student_id')).slice(0, 500).map(publicStudent_);
}

function startServiceSession(payload) {
  const admin = assertAdmin_();
  payload = payload || {};
  const running = readTable_(APP.SHEETS.SERVICES).find(function(row) {
    return normalizeEmail_(row.staff_email) === admin.email && String(row.status) === 'RUNNING';
  });
  if (running) return publicService_(running);
  const student = resolveStudent_(payload);
  const now = new Date();
  const record = {
    session_id: 'svc_' + shortId_(), student_id: student.student_id, student_email: student.email,
    student_name: student.full_name, class_name: student.class_name, document_id: sanitizeId_(payload.documentId),
    recording_type: 'LIVE', started_at: now, ended_at: '', duration_minutes: '', topic: '', result: '',
    staff_email: admin.email, note: '', status: 'RUNNING', created_at: now, updated_at: now
  };
  appendRecord_(APP.SHEETS.SERVICES, record);
  audit_('START_SERVICE_SESSION', 'ServiceSession', record.session_id, admin.email, { studentId: record.student_id });
  return publicService_(record);
}

function getActiveServiceSession() {
  const admin = assertAdmin_();
  const row = readTable_(APP.SHEETS.SERVICES).find(function(item) {
    return normalizeEmail_(item.staff_email) === admin.email && String(item.status) === 'RUNNING';
  });
  return row ? publicService_(row) : null;
}

function finishServiceSession(payload) {
  const admin = assertAdmin_();
  payload = payload || {};
  const row = findBy_(APP.SHEETS.SERVICES, 'session_id', sanitizeId_(payload.sessionId));
  if (!row || normalizeEmail_(row.staff_email) !== admin.email || String(row.status) !== 'RUNNING') {
    throw new Error('NOT_FOUND|Không tìm thấy phiên tiếp sinh viên đang chạy.');
  }
  const now = new Date();
  const started = dateValue_(row.started_at);
  const duration = Math.max(1, Math.round((now.getTime() - started.getTime()) / 60000));
  const topic = sanitizeText_(payload.topic, 1500);
  const result = sanitizeText_(payload.result, 1500);
  if (!topic || !result) throw new Error('VALIDATION|Nhập nội dung trao đổi và kết quả xử lý.');
  const messageTitle = sanitizeNotificationTitle_(payload.messageTitle);
  const messageBody = sanitizeNotificationBody_(payload.messageBody);
  const content = serviceNotificationContent_(topic, result, messageTitle, messageBody, row);
  updateRow_(APP.SHEETS.SERVICES, row._row, { ended_at: now, duration_minutes: duration, topic: topic, result: result, note: sanitizeText_(payload.note, 1000), status: 'COMPLETED', updated_at: now });
  notify_(row.student_email, row.document_id, content.title, content.message, admin.email, toBoolean_(payload.sendEmail), content.i18n);
  audit_('FINISH_SERVICE_SESSION', 'ServiceSession', row.session_id, admin.email, { duration: duration });
  return publicService_(Object.assign({}, row, { ended_at: now, duration_minutes: duration, topic: topic, result: result, note: payload.note || '', status: 'COMPLETED', updated_at: now }));
}

function addManualServiceSession(payload) {
  const admin = assertAdmin_();
  payload = payload || {};
  const student = resolveStudent_(payload);
  const started = parseDateTimeInput_(payload.startedAt);
  const ended = parseDateTimeInput_(payload.endedAt);
  if (!started || !ended || ended.getTime() < started.getTime()) throw new Error('VALIDATION|Thời gian tiếp sinh viên không hợp lệ.');
  const topic = sanitizeText_(payload.topic, 1500);
  const result = sanitizeText_(payload.result, 1500);
  if (!topic || !result) throw new Error('VALIDATION|Nhập nội dung trao đổi và kết quả xử lý.');
  const messageTitle = sanitizeNotificationTitle_(payload.messageTitle);
  const messageBody = sanitizeNotificationBody_(payload.messageBody);
  const now = new Date();
  const record = {
    session_id: 'svc_' + shortId_(), student_id: student.student_id, student_email: student.email,
    student_name: student.full_name, class_name: student.class_name, document_id: sanitizeId_(payload.documentId),
    recording_type: 'MANUAL', started_at: started, ended_at: ended,
    duration_minutes: Math.max(0, Math.round((ended.getTime() - started.getTime()) / 60000)),
    topic: topic, result: result, staff_email: admin.email, note: sanitizeText_(payload.note, 1000),
    status: 'COMPLETED', created_at: now, updated_at: now
  };
  const content = serviceNotificationContent_(topic, result, messageTitle, messageBody, student);
  appendRecord_(APP.SHEETS.SERVICES, record);
  notify_(student.email, record.document_id, content.title, content.message, admin.email, toBoolean_(payload.sendEmail), content.i18n);
  audit_('ADD_MANUAL_SERVICE_SESSION', 'ServiceSession', record.session_id, admin.email, { duration: record.duration_minutes });
  return publicService_(record);
}

function listServiceSessions(filters) {
  assertAdmin_();
  filters = filters || {};
  const query = String(filters.query || '').trim().toLowerCase();
  return readTable_(APP.SHEETS.SERVICES).filter(function(row) {
    if (!query) return true;
    return [row.student_id, row.student_email, row.student_name, row.topic, row.staff_email].some(function(value) {
      return String(value || '').toLowerCase().indexOf(query) !== -1;
    });
  }).sort(sortDesc_('started_at')).slice(0, 500).map(publicService_);
}

function listMyNotifications() {
  const identity = assertStudent_();
  return readTable_(APP.SHEETS.NOTIFICATIONS).filter(function(row) {
    return normalizeEmail_(row.student_email) === identity.email;
  }).sort(sortDesc_('created_at')).slice(0, 200).map(publicNotification_);
}

function markNotificationRead(notificationId) {
  const identity = assertStudent_();
  const row = findBy_(APP.SHEETS.NOTIFICATIONS, 'notification_id', sanitizeId_(notificationId));
  if (!row || normalizeEmail_(row.student_email) !== identity.email) throw new Error('NOT_FOUND|Không tìm thấy thông báo.');
  updateRow_(APP.SHEETS.NOTIFICATIONS, row._row, { read: true });
  return { ok: true };
}

function getReport(filters) {
  assertAdmin_();
  filters = filters || {};
  const from = parseDateInput_(filters.from);
  const to = parseDateInput_(filters.to);
  if (to) to.setHours(23, 59, 59, 999);
  function within(value) {
    const date = dateValue_(value);
    return (!from || date >= from) && (!to || date <= to);
  }
  const allTransactions = readTable_(APP.SHEETS.TRANSACTIONS);
  const transactions = allTransactions.filter(function(row) { return within(row.created_at); });
  const documentRequests = readTable_(APP.SHEETS.REQUESTS).filter(function(row) { return within(row.created_at); });
  const allItems = readTable_(APP.SHEETS.ITEMS);
  const approvedItems = allItems.filter(function(row) { return String(row.status) === 'APPROVED' && within(row.reviewed_at); });
  const transactionById = {};
  allTransactions.forEach(function(row) { transactionById[row.transaction_id] = row; });
  const allDocuments = readTable_(APP.SHEETS.DOCUMENTS);
  const activeDocuments = allDocuments.filter(function(row) { return toBoolean_(row.active); });
  const documents = allDocuments.filter(function(row) { return within(row.submitted_at); });
  const events = readTable_(APP.SHEETS.EVENTS);
  const earliestCompletedByDoc = {};
  events.forEach(function(event) {
    if (['Đã hoàn thành', 'Đã bàn giao'].indexOf(String(event.status)) === -1) return;
    const docId = event.document_id;
    const ts = dateValue_(event.created_at).getTime();
    if (!isNaN(ts) && (earliestCompletedByDoc[docId] == null || ts < earliestCompletedByDoc[docId])) {
      earliestCompletedByDoc[docId] = ts;
    }
  });
  const services = readTable_(APP.SHEETS.SERVICES).filter(function(row) { return within(row.started_at) && String(row.status) === 'COMPLETED'; });
  const completedDocs = documents.filter(function(row) { return ['Đã hoàn thành', 'Đã bàn giao'].indexOf(String(row.status)) !== -1; });
  const processingDays = completedDocs.map(function(row) {
    const completedTs = earliestCompletedByDoc[row.document_id];
    return completedTs != null ? Math.max(0, (completedTs - dateValue_(row.submitted_at).getTime()) / 86400000) : 0;
  });
  const totalMinutes = services.reduce(function(sum, row) { return sum + Number(row.duration_minutes || 0); }, 0);
  const now = new Date();
  return {
    from: from ? iso_(from) : '', to: to ? iso_(to) : '',
    transactionCount: approvedItems.map(function(item) { return item.transaction_id; }).filter(function(id, index, array) { return array.indexOf(id) === index; }).length,
    approvedItemCount: approvedItems.length,
    submittedCount: approvedItems.filter(function(item) { return transactionById[item.transaction_id] && transactionById[item.transaction_id].transaction_type === 'SUBMIT'; }).length,
    receivedCount: approvedItems.filter(function(item) { return transactionById[item.transaction_id] && transactionById[item.transaction_id].transaction_type === 'RECEIVE'; }).length,
    requestCount: transactions.length,
    submittedRequestCount: transactions.filter(function(row) { return row.transaction_type === 'SUBMIT'; }).length,
    receivedRequestCount: transactions.filter(function(row) { return row.transaction_type === 'RECEIVE'; }).length,
    pendingRequestCount: transactions.filter(function(row) { return ['PENDING', 'PARTIAL'].indexOf(String(row.status)) !== -1; }).length,
    documentRequestCount: documentRequests.length,
    openDocumentRequestCount: documentRequests.filter(function(row) { return OPEN_DOCUMENT_REQUEST_STATUSES_.indexOf(String(row.status)) !== -1; }).length,
    readyDocumentRequestCount: documentRequests.filter(function(row) { return String(row.status) === 'READY'; }).length,
    storedDocuments: activeDocuments.filter(function(row) { return String(row.storage_status) === 'AT_OFFICE'; }).length,
    processingDocuments: activeDocuments.filter(function(row) { return ['Đã hoàn thành', 'Đã bàn giao', 'Đã hủy'].indexOf(String(row.status)) === -1; }).length,
    supplementDocuments: activeDocuments.filter(function(row) { return String(row.status) === 'Yêu cầu bổ sung'; }).length,
    overdueDocuments: allDocuments.filter(function(row) { return row.expected_at && dateValue_(row.expected_at) < now && ['Đã hoàn thành', 'Đã bàn giao', 'Đã hủy'].indexOf(String(row.status)) === -1; }).length,
    completedDocuments: completedDocs.length,
    waitingPickup: allDocuments.filter(function(row) { return String(row.status) === 'Chờ sinh viên đến nhận'; }).length,
    averageProcessingDays: processingDays.length ? Math.round(processingDays.reduce(function(a, b) { return a + b; }, 0) / processingDays.length * 10) / 10 : 0,
    serviceCount: services.length,
    serviceMinutes: totalMinutes,
    averageServiceMinutes: services.length ? Math.round(totalMinutes / services.length * 10) / 10 : 0
  };
}

function exportReportCsv(filters) {
  const report = getReport(filters);
  const rows = [['Chỉ số', 'Giá trị']];
  const labels = {
    transactionCount: 'Yêu cầu có giao nhận được xác nhận', approvedItemCount: 'Số giấy tờ được xác nhận', submittedCount: 'Giấy tờ đã nộp',
    receivedCount: 'Giấy tờ đã nhận', requestCount: 'Tổng yêu cầu đã gửi', submittedRequestCount: 'Yêu cầu nộp đã gửi',
    receivedRequestCount: 'Yêu cầu nhận đã gửi', pendingRequestCount: 'Yêu cầu còn chờ xác nhận', storedDocuments: 'Hồ sơ đang lưu giữ', processingDocuments: 'Hồ sơ đang xử lý',
    documentRequestCount: 'Yêu cầu cấp hồ sơ', openDocumentRequestCount: 'Yêu cầu cấp hồ sơ đang mở', readyDocumentRequestCount: 'Yêu cầu cấp hồ sơ chờ nhận',
    supplementDocuments: 'Hồ sơ cần bổ sung', overdueDocuments: 'Hồ sơ quá hạn', completedDocuments: 'Hồ sơ hoàn thành',
    waitingPickup: 'Hồ sơ chờ nhận', averageProcessingDays: 'Thời gian xử lý trung bình (ngày)', serviceCount: 'Lượt tiếp sinh viên',
    serviceMinutes: 'Tổng thời gian tiếp (phút)', averageServiceMinutes: 'Thời lượng tiếp trung bình (phút)'
  };
  Object.keys(labels).forEach(function(key) { rows.push([labels[key], report[key]]); });
  return '\ufeff' + rows.map(function(row) { return row.map(csvCell_).join(','); }).join('\r\n');
}

function getSettings() {
  assertAdmin_();
  return getSettings_();
}

function saveSettings(payload) {
  const admin = assertAdmin_();
  payload = payload || {};
  const allowed = ['APP_NAME', 'OFFICE_NAME'];
  const now = new Date();
  allowed.forEach(function(key) {
    if (payload[key] == null) return;
    const row = findBy_(APP.SHEETS.SETTINGS, 'key', key);
    const value = sanitizeText_(payload[key], 200);
    if (row) updateRow_(APP.SHEETS.SETTINGS, row._row, { value: value, updated_at: now, updated_by: admin.email });
    else appendRecord_(APP.SHEETS.SETTINGS, { key: key, value: value, description: '', updated_at: now, updated_by: admin.email });
  });
  audit_('SAVE_SETTINGS', 'Settings', 'global', admin.email, { keys: allowed });
  return getSettings_();
}

function listEmailQueue() {
  assertAdmin_();
  return readTable_(APP.SHEETS.EMAIL_QUEUE).sort(sortDesc_('created_at')).slice(0, 200).map(function(row) {
    return { emailId: row.email_id, recipient: row.recipient, subject: row.subject, status: row.status, attempts: Number(row.attempts || 0), lastError: row.last_error || '', createdAt: iso_(row.created_at), sentAt: iso_(row.sent_at) };
  });
}

function retryEmail(emailId) {
  assertAdmin_();
  const row = findBy_(APP.SHEETS.EMAIL_QUEUE, 'email_id', sanitizeId_(emailId));
  if (!row) throw new Error('NOT_FOUND|Không tìm thấy email.');
  sendQueuedEmail_(row);
  return { ok: true };
}

function setupSystem() {
  ensureSystemInitialized_(true);
  const admin = assertAdmin_();
  const spreadsheet = getSpreadsheet_();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheet.getId());
  audit_('SETUP_SYSTEM', 'System', spreadsheet.getId(), admin.email, { schemaVersion: 5 });
  return { ok: true, schemaVersion: 5, spreadsheetId: spreadsheet.getId(), spreadsheetUrl: spreadsheet.getUrl(), webAppUrl: ScriptApp.getService().getUrl() };
}

function isSystemInitializedFast_(expectedState) {
  if (!expectedState) return false;
  if (runtimeCache_.initState === expectedState) return true;
  try {
    if (typeof CacheService !== 'undefined') {
      const cached = CacheService.getScriptCache().get(INIT_VERSION_KEY);
      if (cached === expectedState) {
        runtimeCache_.initState = expectedState;
        return true;
      }
    }
    if (typeof PropertiesService !== 'undefined') {
      const stored = PropertiesService.getScriptProperties().getProperty(INIT_VERSION_KEY);
      if (stored === expectedState) {
        runtimeCache_.initState = expectedState;
        if (typeof CacheService !== 'undefined') {
          CacheService.getScriptCache().put(INIT_VERSION_KEY, expectedState, INIT_CACHE_TTL_SECONDS);
        }
        return true;
      }
    }
  } catch (error) {}
  return false;
}

function markSystemInitialized_(spreadsheetId, stateValue) {
  runtimeCache_.initState = stateValue;
  try {
    if (typeof PropertiesService !== 'undefined') {
      PropertiesService.getScriptProperties().setProperties({
        SPREADSHEET_ID: spreadsheetId,
      SCHEMA_INIT_V5: stateValue
      });
    }
    if (typeof CacheService !== 'undefined') {
      CacheService.getScriptCache().put(INIT_VERSION_KEY, stateValue, INIT_CACHE_TTL_SECONDS);
    }
  } catch (error) {}
}

function ensureSystemInitialized_(force) {
  const configuredId = getConfiguredSpreadsheetId_();
  const expectedState = configuredId ? (configuredId + ':v5') : '';
  if (!force && isSystemInitializedFast_(expectedState)) return;

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (!force && isSystemInitializedFast_(expectedState)) return;
    const spreadsheet = getSpreadsheet_();
    const actualState = spreadsheet.getId() + ':v5';
    if (!force && isSystemInitializedFast_(actualState)) return;

    Object.keys(HEADERS).forEach(function(name) {
      let sheet = spreadsheet.getSheetByName(name);
      if (!sheet) sheet = spreadsheet.insertSheet(name);
      runtimeCache_.sheets[name] = sheet;
      ensureSheetSchema_(sheet, name);
    });
    if (!findBy_(APP.SHEETS.ADMINS, 'email', APP.DEFAULT_ADMIN)) {
      appendRecord_(APP.SHEETS.ADMINS, { email: APP.DEFAULT_ADMIN, name: 'Nguyễn Thái Khôi', role: 'SUPER_ADMIN', active: true, created_at: new Date(), updated_at: new Date() });
    }
    migrateSystemData_();
    ensureDefaultSettings_();
    markSystemInitialized_(spreadsheet.getId(), actualState);
  } finally {
    lock.releaseLock();
  }
}

function ensureSheetSchema_(sheet, name) {
  const expected = HEADERS[name];
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
  const row = sheet.getRange(1, 1, 1, expected.length).getValues()[0].map(String);
  let populated = row.length;
  while (populated > 0 && !row[populated - 1]) populated -= 1;
  for (let index = 0; index < populated; index += 1) {
    if (row[index] !== expected[index]) throw new Error('SCHEMA_MISMATCH|Sai cấu trúc cột tại tab ' + name + '.');
  }
  if (populated < expected.length) {
    sheet.getRange(1, populated + 1, 1, expected.length - populated).setValues([expected.slice(populated)]);
  }
  styleDataSheet_(sheet, expected.length);
}

function migrateSystemData_() {
  readTable_(APP.SHEETS.TYPES).forEach(function(row) {
    if (!row.handover_mode) updateRow_(APP.SHEETS.TYPES, row._row, { handover_mode: 'BOTH' });
    if (row.request_enabled === '' || row.request_enabled == null) updateRow_(APP.SHEETS.TYPES, row._row, { request_enabled: false });
  });
  const appNameRow = findBy_(APP.SHEETS.SETTINGS, 'key', 'APP_NAME');
  if (appNameRow && ['Hệ thống Giao nhận Hồ sơ Sinh viên', 'Giao nhận hồ sơ'].indexOf(String(appNameRow.value)) !== -1) {
    updateRow_(APP.SHEETS.SETTINGS, appNameRow._row, { value: APP.NAME, updated_at: new Date(), updated_by: APP.DEFAULT_ADMIN });
  }
  const version = findBy_(APP.SHEETS.SETTINGS, 'key', 'SCHEMA_VERSION');
  if (version) {
    if (String(version.value) !== '5') updateRow_(APP.SHEETS.SETTINGS, version._row, { value: '5', updated_at: new Date(), updated_by: APP.DEFAULT_ADMIN });
  } else {
    appendRecord_(APP.SHEETS.SETTINGS, { key: 'SCHEMA_VERSION', value: '5', description: 'Phiên bản cấu trúc dữ liệu', updated_at: new Date(), updated_by: APP.DEFAULT_ADMIN });
  }
}

function healthCheck() {
  const admin = assertAdmin_();
  const spreadsheet = getSpreadsheet_();
  const sheets = Object.keys(HEADERS).map(function(name) {
    const sheet = spreadsheet.getSheetByName(name);
    return { name: name, exists: Boolean(sheet), rows: sheet ? Math.max(0, sheet.getLastRow() - 1) : 0 };
  });
  return { ok: sheets.every(function(item) { return item.exists; }), actor: admin.email, spreadsheetId: spreadsheet.getId(), webAppUrl: ScriptApp.getService().getUrl(), sheets: sheets };
}

function ensureDefaultSettings_() {
  const now = new Date();
  [['APP_NAME', APP.NAME, 'Tên hiển thị của ứng dụng'], ['OFFICE_NAME', 'Văn phòng Khoa', 'Tên đơn vị vận hành'], ['TIMEZONE', APP.TIMEZONE, 'Múi giờ vận hành'], ['SCHEMA_VERSION', '5', 'Phiên bản cấu trúc dữ liệu']].forEach(function(row) {
    if (!findBy_(APP.SHEETS.SETTINGS, 'key', row[0])) {
      appendRecord_(APP.SHEETS.SETTINGS, { key: row[0], value: row[1], description: row[2], updated_at: now, updated_by: APP.DEFAULT_ADMIN });
    }
  });
}

function getConfiguredSpreadsheetId_() {
  if (runtimeCache_.spreadsheetId) return runtimeCache_.spreadsheetId;
  let id = APP.SPREADSHEET_ID;
  try {
    if (typeof PropertiesService !== 'undefined') {
      id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || APP.SPREADSHEET_ID;
    }
  } catch (error) {}
  runtimeCache_.spreadsheetId = id || '';
  return runtimeCache_.spreadsheetId;
}

function getSpreadsheet_() {
  if (runtimeCache_.spreadsheet) return runtimeCache_.spreadsheet;
  const id = getConfiguredSpreadsheetId_();
  if (id) {
    runtimeCache_.spreadsheet = SpreadsheetApp.openById(id);
    return runtimeCache_.spreadsheet;
  }
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) {
      runtimeCache_.spreadsheet = active;
      runtimeCache_.spreadsheetId = active.getId();
      return active;
    }
  } catch (error) {}
  throw new Error('SETUP_REQUIRED|Chưa cấu hình Google Sheets cho ứng dụng.');
}

function getSheet_(name) {
  if (runtimeCache_.sheets[name]) return runtimeCache_.sheets[name];
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('SHEET_MISSING|Không tìm thấy tab dữ liệu ' + name + '.');
  runtimeCache_.sheets[name] = sheet;
  return sheet;
}

function getScriptCacheKey_(name) {
  return 'TABLE_V3_' + (getConfiguredSpreadsheetId_() || 'default') + '_' + name;
}

function clearScriptCacheForSheet_(name) {
  if (!CACHED_SHEETS[name]) return;
  try {
    if (typeof CacheService !== 'undefined') {
      CacheService.getScriptCache().remove(getScriptCacheKey_(name));
    }
  } catch (error) {}
}

function readTable_(name) {
  if (runtimeCache_.tables[name]) return runtimeCache_.tables[name];
  const headers = HEADERS[name];
  if (CACHED_SHEETS[name]) {
    try {
      if (typeof CacheService !== 'undefined') {
        const raw = CacheService.getScriptCache().get(getScriptCacheKey_(name));
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            runtimeCache_.tables[name] = parsed;
            return parsed;
          }
        }
      }
    } catch (error) {}
  }
  const sheet = getSheet_(name);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    runtimeCache_.tables[name] = [];
    return [];
  }
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const rows = [];
  for (let index = 0; index < values.length; index += 1) {
    const row = values[index];
    if (!row.some(function(value) { return value !== '' && value != null; })) continue;
    const record = { _row: index + 2 };
    headers.forEach(function(header, column) { record[header] = row[column]; });
    rows.push(record);
  }
  runtimeCache_.tables[name] = rows;
  if (CACHED_SHEETS[name]) {
    try {
      if (typeof CacheService !== 'undefined') {
        const serialized = JSON.stringify(rows);
        if (serialized.length < 95000) {
          CacheService.getScriptCache().put(getScriptCacheKey_(name), serialized, CACHE_TTL_SECONDS);
        }
      }
    } catch (error) {}
  }
  return rows;
}

function appendRecord_(name, record) {
  const sheet = getSheet_(name);
  const headers = HEADERS[name];
  const values = headers.map(function(header) { return record[header] == null ? '' : record[header]; });
  sheet.appendRow(values);
  if (runtimeCache_.tables[name]) {
    const rows = runtimeCache_.tables[name];
    const nextRow = rows.length ? (rows[rows.length - 1]._row + 1) : 2;
    const cachedRecord = { _row: nextRow };
    headers.forEach(function(header, index) { cachedRecord[header] = values[index]; });
    rows.push(cachedRecord);
  }
  clearScriptCacheForSheet_(name);
}

function updateRow_(name, rowNumber, patch) {
  const sheet = getSheet_(name);
  const headers = HEADERS[name];
  const range = sheet.getRange(rowNumber, 1, 1, headers.length);
  const cachedRow = runtimeCache_.tables[name] ? runtimeCache_.tables[name].find(function(item) { return item._row === rowNumber; }) : null;
  const values = cachedRow
    ? headers.map(function(header) { return cachedRow[header] == null ? '' : cachedRow[header]; })
    : range.getValues()[0];
  headers.forEach(function(header, index) {
    if (Object.prototype.hasOwnProperty.call(patch, header)) {
      values[index] = patch[header] == null ? '' : patch[header];
      if (cachedRow) cachedRow[header] = values[index];
    }
  });
  range.setValues([values]);
  clearScriptCacheForSheet_(name);
}

function deleteRow_(name, rowNumber) {
  getSheet_(name).deleteRow(rowNumber);
  delete runtimeCache_.tables[name];
  clearScriptCacheForSheet_(name);
}

function findBy_(name, field, value) {
  const target = String(value == null ? '' : value).toLowerCase();
  return readTable_(name).find(function(row) { return String(row[field] == null ? '' : row[field]).toLowerCase() === target; }) || null;
}

function refreshTransactionStatus_(transactionId, adminEmail) {
  const transaction = findBy_(APP.SHEETS.TRANSACTIONS, 'transaction_id', transactionId);
  if (!transaction) return;
  const items = readTable_(APP.SHEETS.ITEMS).filter(function(row) { return row.transaction_id === transactionId; });
  const pending = items.filter(function(row) { return String(row.status) === 'PENDING'; }).length;
  const approved = items.filter(function(row) { return String(row.status) === 'APPROVED'; }).length;
  const status = pending > 0 ? (approved > 0 ? 'PARTIAL' : 'PENDING') : (approved > 0 ? 'COMPLETED' : 'REJECTED');
  updateRow_(APP.SHEETS.TRANSACTIONS, transaction._row, { status: status, updated_at: new Date(), reviewed_by: adminEmail });
}

function buildTransactionResults_(transactions, ownerEmail, adminView) {
  if (!transactions.length) return [];
  const allItems = readTable_(APP.SHEETS.ITEMS);
  const itemsByTx = {};
  allItems.forEach(function(item) {
    const txId = item.transaction_id;
    if (!itemsByTx[txId]) itemsByTx[txId] = [];
    itemsByTx[txId].push(item);
  });
  const needsPickupCandidates = adminView && transactions.some(function(tx) { return tx.transaction_type === 'RECEIVE'; });
  const waitingDocsByKey = {};
  if (needsPickupCandidates) {
    readTable_(APP.SHEETS.DOCUMENTS).forEach(function(doc) {
      if (String(doc.status) !== 'Chờ sinh viên đến nhận' || !toBoolean_(doc.active)) return;
      const key = normalizeEmail_(doc.student_email) + '|' + doc.type_id;
      if (!waitingDocsByKey[key]) waitingDocsByKey[key] = [];
      waitingDocsByKey[key].push({ documentId: doc.document_id, code: doc.document_code, updatedAt: iso_(doc.updated_at) });
    });
  }
  const normalizedOwner = normalizeEmail_(ownerEmail);
  return transactions.map(function(transaction) {
    if (!adminView && normalizeEmail_(transaction.student_email) !== normalizedOwner) {
      throw new Error('ACCESS_DENIED|Bạn không có quyền xem yêu cầu này.');
    }
    const items = itemsByTx[transaction.transaction_id] || [];
    const studentEmailKey = normalizeEmail_(transaction.student_email);
    return {
      transactionId: transaction.transaction_id, code: transaction.transaction_code, studentId: transaction.student_id,
      studentEmail: transaction.student_email, studentName: transaction.student_name, className: transaction.class_name,
      type: transaction.transaction_type, status: transaction.status, note: transaction.student_note || '',
      createdAt: iso_(transaction.created_at), updatedAt: iso_(transaction.updated_at),
      items: items.map(function(item) {
        const result = { itemId: item.item_id, typeId: item.type_id, typeName: item.type_name, typeNameEn: notificationTypeNames_(item.type_id, item.type_name).en, documentId: item.document_id || '', relatedDocumentId: item.related_document_id || '', status: item.status, adminNote: item.admin_note || '', reviewedAt: iso_(item.reviewed_at), reviewedBy: item.reviewed_by || '' };
        if (adminView && transaction.transaction_type === 'RECEIVE' && !item.document_id && String(item.status) === 'PENDING') {
          result.pickupCandidates = waitingDocsByKey[studentEmailKey + '|' + item.type_id] || [];
        }
        return result;
      })
    };
  });
}

function getTransactionResult_(transactionId, ownerEmail, adminView) {
  const transaction = findBy_(APP.SHEETS.TRANSACTIONS, 'transaction_id', transactionId);
  if (!transaction) throw new Error('NOT_FOUND|Không tìm thấy yêu cầu.');
  return buildTransactionResults_([transaction], ownerEmail, adminView)[0];
}

function getWorkflowSteps_(workflowId) {
  if (!workflowId) return [];
  return readTable_(APP.SHEETS.WORKFLOW_STEPS).filter(function(row) { return row.workflow_version_id === workflowId; }).sort(function(a, b) { return Number(a.step_order) - Number(b.step_order); });
}

function touchDocument_(documentId, adminEmail, publicNote) {
  const document = findBy_(APP.SHEETS.DOCUMENTS, 'document_id', documentId);
  if (!document) throw new Error('NOT_FOUND|Không tìm thấy hồ sơ cần bổ sung.');
  updateRow_(APP.SHEETS.DOCUMENTS, document._row, { updated_at: new Date(), updated_by: adminEmail, public_note: publicNote || document.public_note, version: Number(document.version || 0) + 1 });
}

function notificationTypeNames_(typeId, fallback) {
  const type = typeId ? findBy_(APP.SHEETS.TYPES, 'type_id', typeId) : null;
  const vi = type && type.name ? type.name : (fallback || '');
  return { vi: vi, en: type && type.name_en ? type.name_en : vi };
}

function notificationStatus_(status, workflowId) {
  const step = workflowId ? getWorkflowSteps_(workflowId).find(function(item) { return item.status_label === status; }) : null;
  return { vi: status || '', en: step && step.status_label_en ? step.status_label_en : (status || '') };
}

function workflowName_(workflowId) {
  const workflow = workflowId ? findBy_(APP.SHEETS.WORKFLOW_VERSIONS, 'workflow_version_id', workflowId) : null;
  return workflow ? workflow.name : '';
}

function documentNotificationContent_(document, status, step, publicNote, customMessage, templateKey, expectedAt) {
  const names = notificationTypeNames_(document.type_id, document.type_name);
  const workflow = document.workflow_version_id ? findBy_(APP.SHEETS.WORKFLOW_VERSIONS, 'workflow_version_id', document.workflow_version_id) : null;
  const translatedStatus = notificationStatus_(status, document.workflow_version_id);
  const workflowVi = workflow ? workflow.name : '';
  const workflowEn = workflow ? (workflow.name_en || workflow.name) : '';
  const stepVi = step ? (step.name || step.status_label) : '';
  const stepEn = step ? (step.name_en || step.status_label_en || step.name || step.status_label) : '';
  const note = sanitizeMessageText_(publicNote, 1500);
  const lines = [];
  if (workflowVi) lines.push('Quy trình: ' + workflowVi);
  if (stepVi) lines.push('Giai đoạn xử lý: ' + stepVi);
  if (status) lines.push('Trạng thái: ' + status);
  if (note) lines.push('Phản hồi: ' + note);
  const workflowLineVi = workflowVi ? 'Quy trình: ' + workflowVi : '';
  const workflowLineEn = workflowEn ? 'Workflow: ' + workflowEn : '';
  const stepLineVi = stepVi ? 'Giai đoạn xử lý: ' + stepVi : '';
  const stepLineEn = stepEn ? 'Processing stage: ' + stepEn : '';
  const statusLineVi = status ? 'Trạng thái: ' + translatedStatus.vi : '';
  const statusLineEn = status ? 'Status: ' + translatedStatus.en : '';
  const noteLineVi = note ? 'Phản hồi: ' + note : '';
  const noteLineEn = note ? 'Note: ' + note : '';
  const key = templateKey || 'documentProgress';
  const compiled = compileNotificationMessage_(customMessage, '', key, document, {
    typeName: names.vi, documentCode: document.document_code, status: status,
    expectedAt: expectedAt || document.expected_at, workflow: workflowVi,
    step: stepVi, publicNote: note
  }, names.vi, {loai_ho_so: names.en, trang_thai: translatedStatus.en, quy_trinh: workflowEn, buoc_xu_ly: stepEn});
  const message = compiled.body || lines.join('\n');
  const isCancel = key === 'documentCancel';
  const params = isCancel ? {note: note} : {
    nameVi: names.vi, nameEn: names.en,
    workflowLineVi: workflowLineVi, workflowLineEn: workflowLineEn,
    stepLineVi: stepLineVi, stepLineEn: stepLineEn,
    statusLineVi: statusLineVi, statusLineEn: statusLineEn,
    noteLineVi: noteLineVi, noteLineEn: noteLineEn
  };
  return {
    title: names.vi,
    message: message,
    i18n: {
      titleKey: isCancel ? 'documentCancelledTitle' : 'documentTypeTitle',
      messageKey: isCancel ? (customMessage && !compiled.bodyIsDefault ? '' : 'customNote') : (customMessage && !compiled.bodyIsDefault ? '' : 'documentProgressSummary'),
      messageEn: compiled.messageEn,
      params: params,
      customMessage: !!customMessage && !compiled.bodyIsDefault
    }
  };
}

function serviceNotificationContent_(topic, result, customTitle, customMessage, student) {
  const compiled = compileNotificationMessage_(customMessage, customTitle, 'service', student, {topic: topic, result: result}, 'Kết quả tiếp sinh viên');
  return {
    title: compiled.title || 'Kết quả tiếp sinh viên',
    message: compiled.body || ('Nội dung trao đổi: ' + topic + '\nKết quả xử lý: ' + result),
    i18n: {
      titleKey: customTitle && !compiled.titleIsDefault ? '' : 'serviceSessionTitle',
      messageKey: customMessage && !compiled.bodyIsDefault ? '' : 'serviceSessionSummary',
      messageEn: compiled.messageEn,
      titleEn: compiled.titleEn,
      params: { topic: topic, result: result },
      customTitle: !!customTitle && !compiled.titleIsDefault,
      customMessage: !!customMessage && !compiled.bodyIsDefault
    }
  };
}

function notify_(recipient, documentId, title, message, actor, sendEmail, i18n, requestId) {
  const notification = { notification_id: 'ntf_' + shortId_(), student_email: normalizeEmail_(recipient), document_id: documentId || '', request_id: requestId || '', title: sanitizeNotificationTitle_(title) || 'Thông báo', message: sanitizeNotificationBody_(message), read: false, created_at: new Date(), created_by: actor, i18n_json: i18n ? JSON.stringify(i18n) : '' };
  appendRecord_(APP.SHEETS.NOTIFICATIONS, notification);
  if (sendEmail) queueAndSendEmail_(recipient, notification.title, notification.message);
}

function queueAndSendEmail_(recipient, subject, body) {
  const row = { email_id: 'mail_' + shortId_(), recipient: normalizeEmail_(recipient), subject: sanitizeNotificationTitle_(subject) || 'Thông báo', body: sanitizeNotificationBody_(body), status: 'PENDING', attempts: 0, last_error: '', created_at: new Date(), sent_at: '' };
  appendRecord_(APP.SHEETS.EMAIL_QUEUE, row);
  row._row = getSheet_(APP.SHEETS.EMAIL_QUEUE).getLastRow();
  sendQueuedEmail_(row);
}

function sendQueuedEmail_(row) {
  try {
    MailApp.sendEmail({ to: row.recipient, subject: row.subject, htmlBody: '<div style="font-family:Arial,sans-serif;line-height:1.6;background:#FFFFFF;color:#171717"><h2 style="margin:0 0 16px;color:#171717;font-size:15px">' + escapeHtml_(row.subject) + '</h2><p>' + escapeHtml_(row.body).replace(/\n/g, '<br>') + '</p><p style="color:#5C5C58">' + APP.NAME + '</p></div>' });
    updateRow_(APP.SHEETS.EMAIL_QUEUE, row._row, { status: 'SENT', attempts: Number(row.attempts || 0) + 1, last_error: '', sent_at: new Date() });
  } catch (error) {
    updateRow_(APP.SHEETS.EMAIL_QUEUE, row._row, { status: 'FAILED', attempts: Number(row.attempts || 0) + 1, last_error: sanitizeText_(error.message, 1000) });
  }
}

function audit_(action, entityType, entityId, actor, detail) {
  appendRecord_(APP.SHEETS.AUDIT, { audit_id: 'aud_' + shortId_(), action: action, entity_type: entityType, entity_id: entityId, actor_email: normalizeEmail_(actor), detail_json: JSON.stringify(detail || {}), created_at: new Date() });
}

function requireProfile_(email) {
  const profile = findBy_(APP.SHEETS.STUDENTS, 'email', email);
  if (!profile || !toBoolean_(profile.active) || !profile.full_name || !profile.class_name) throw new Error('PROFILE_REQUIRED|Nhập họ tên và lớp trong mục Tài khoản trước khi gửi yêu cầu.');
  return profile;
}

function resolveStudent_(payload) {
  const email = normalizeEmail_(payload.studentEmail);
  const studentId = sanitizeText_(payload.studentId, 30);
  const student = email ? findBy_(APP.SHEETS.STUDENTS, 'email', email) : findBy_(APP.SHEETS.STUDENTS, 'student_id', studentId);
  if (!student) throw new Error('NOT_FOUND|Không tìm thấy sinh viên. Sinh viên cần đăng nhập và hoàn thiện tài khoản trước.');
  return student;
}

function getSettings_() {
  const result = {};
  readTable_(APP.SHEETS.SETTINGS).forEach(function(row) { result[row.key] = row.value; });
  return result;
}

function styleDataSheet_(sheet, columnCount) {
  sheet.setFrozenRows(1);
  sheet.setHiddenGridlines(true);
  const header = sheet.getRange(1, 1, 1, columnCount);
  header.setBackground('#005AAB').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.autoResizeColumns(1, columnCount);
}

function publicStudent_(row) { return { studentId: row.student_id, email: row.email, fullName: row.full_name || '', className: row.class_name || '', active: toBoolean_(row.active), updatedAt: iso_(row.updated_at) }; }
function publicType_(row) { return { typeId: row.type_id, name: row.name, nameEn: row.name_en || '', description: row.description || '', descriptionEn: row.description_en || '', tracksProgress: toBoolean_(row.tracks_progress), workflowVersionId: row.workflow_version_id || '', active: toBoolean_(row.active), requestEnabled: toBoolean_(row.request_enabled), sortOrder: Number(row.sort_order || 0), handoverMode: normalizeHandoverMode_(row.handover_mode || 'BOTH') }; }
function publicDocument_(row) { const step = row.workflow_version_id ? getWorkflowSteps_(row.workflow_version_id).find(function(item) { return item.status_label === row.status; }) : null; const names = notificationTypeNames_(row.type_id, row.type_name); return { documentId: row.document_id, code: row.document_code, typeId: row.type_id, typeName: row.type_name, typeNameEn: names.en, status: row.status, statusEn: step && step.status_label_en ? step.status_label_en : '', storageStatus: row.storage_status, submittedAt: iso_(row.submitted_at), expectedAt: iso_(row.expected_at), updatedAt: iso_(row.updated_at), publicNote: row.public_note || '', currentStepOrder: Number(row.current_step_order || 0), version: Number(row.version || 0) }; }
function publicDocumentAdmin_(row) { const result = publicDocument_(row); result.studentId = row.student_id; result.studentEmail = row.student_email; result.studentName = row.student_name; result.className = row.class_name; result.internalNote = row.internal_note || ''; result.workflowVersionId = row.workflow_version_id || ''; result.currentStepId = row.current_step_id || ''; result.requestId = row.request_id || ''; return result; }
function publicEvent_(row, adminView) { const result = { eventId: row.event_id, type: row.event_type, status: row.status, publicNote: row.public_note || '', createdAt: iso_(row.created_at), createdBy: row.created_by || '', toStepId: row.to_step_id || '' }; if (adminView) result.internalNote = row.internal_note || ''; return result; }
function publicService_(row) { return { sessionId: row.session_id, studentId: row.student_id, studentEmail: row.student_email, studentName: row.student_name, className: row.class_name, documentId: row.document_id || '', recordingType: row.recording_type, startedAt: iso_(row.started_at), endedAt: iso_(row.ended_at), durationMinutes: Number(row.duration_minutes || 0), topic: row.topic || '', result: row.result || '', staffEmail: row.staff_email, note: row.note || '', status: row.status }; }
function publicNotification_(row) { let i18n = {}; try { i18n = row.i18n_json ? JSON.parse(row.i18n_json) : {}; } catch (error) {} return { notificationId: row.notification_id, documentId: row.document_id || '', requestId: row.request_id || '', title: row.title, message: row.message, i18n: i18n, read: toBoolean_(row.read), createdAt: iso_(row.created_at) }; }

function isStudentEmail_(email) { return new RegExp('^[^@\\s]+@' + APP.STUDENT_DOMAIN.replace(/\./g, '\\.') + '$', 'i').test(normalizeEmail_(email)); }
function extractStudentId_(email) { const local = normalizeEmail_(email).split('@')[0]; return /^\d{5,20}$/.test(local) ? local : ''; }
function normalizeEmail_(value) { return String(value || '').trim().toLowerCase(); }
function normalizeSearch_(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').trim().toLowerCase(); }
function sanitizeText_(value, maxLength) { return String(value == null ? '' : value).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength || 1000); }
function sanitizeMessageText_(value, maxLength) {
  const text = String(value == null ? '' : value).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').trim();
  if (text.length > maxLength) throw new Error('VALIDATION|Nội dung thông báo không được vượt quá ' + maxLength + ' ký tự.');
  return text;
}
function sanitizeNotificationTitle_(value) {
  const text = sanitizeMessageText_(value, 200).replace(/[\t\n ]+/g, ' ').trim();
  return text;
}
function sanitizeNotificationBody_(value) { return sanitizeMessageText_(value, 5000); }
function sanitizeId_(value) { const id = String(value || '').trim(); return /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? id : ''; }
function toBoolean_(value) { return value === true || ['true', '1', 'yes', 'active'].indexOf(String(value || '').toLowerCase()) !== -1; }
function normalizeHandoverMode_(value) { const mode = String(value || '').toUpperCase(); return ['SUBMIT', 'RECEIVE', 'BOTH'].indexOf(mode) !== -1 ? mode : 'BOTH'; }
function typeAllowsTransaction_(type, transactionType) { const mode = normalizeHandoverMode_(type.handover_mode || 'BOTH'); return mode === 'BOTH' || mode === transactionType; }
function shortId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); }
function makeCode_(prefix) { return prefix + '-' + Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyyMMdd-HHmmss') + '-' + Math.floor(100 + Math.random() * 900); }
function iso_(value) { if (!value) return ''; const date = dateValue_(value); return isNaN(date.getTime()) ? '' : date.toISOString(); }
function dateValue_(value) { return value instanceof Date ? value : new Date(value); }
function parseDateInput_(value) { if (!value) return null; const date = new Date(String(value) + (String(value).length === 10 ? 'T00:00:00+07:00' : '')); return isNaN(date.getTime()) ? null : date; }
function parseDateTimeInput_(value) { if (!value) return null; const date = new Date(value); return isNaN(date.getTime()) ? null : date; }
function sortDesc_(field) { return function(a, b) { return dateValue_(b[field]).getTime() - dateValue_(a[field]).getTime(); }; }
function sortAsc_(field) { return function(a, b) { const av = a[field]; const bv = b[field]; if (av instanceof Date || bv instanceof Date || /_at$/.test(field)) return dateValue_(av).getTime() - dateValue_(bv).getTime(); return String(av || '').localeCompare(String(bv || ''), 'vi'); }; }
function csvCell_(value) { const text = String(value == null ? '' : value); return '"' + text.replace(/"/g, '""') + '"'; }
function escapeHtml_(value) { return String(value || '').replace(/[&<>"']/g, function(char) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]; }); }
