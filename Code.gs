const APP = Object.freeze({
  NAME: 'Hệ thống Giao nhận Hồ sơ Sinh viên',
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
  DocumentTypes: ['type_id', 'name', 'description', 'tracks_progress', 'workflow_version_id', 'active', 'sort_order', 'created_at', 'updated_at', 'handover_mode'],
  WorkflowVersions: ['workflow_version_id', 'name', 'version', 'active', 'created_at', 'created_by'],
  WorkflowSteps: ['step_id', 'workflow_version_id', 'step_order', 'name', 'status_label', 'created_at'],
  Documents: ['document_id', 'document_code', 'student_id', 'student_email', 'student_name', 'class_name', 'type_id', 'type_name', 'workflow_version_id', 'current_step_id', 'current_step_order', 'status', 'storage_status', 'submitted_at', 'expected_at', 'updated_at', 'updated_by', 'public_note', 'internal_note', 'version', 'active'],
  DocumentEvents: ['event_id', 'document_id', 'event_type', 'from_step_id', 'to_step_id', 'status', 'public_note', 'internal_note', 'created_at', 'created_by'],
  Transactions: ['transaction_id', 'transaction_code', 'student_id', 'student_email', 'student_name', 'class_name', 'transaction_type', 'status', 'student_note', 'request_token', 'created_at', 'updated_at', 'reviewed_by'],
  TransactionItems: ['item_id', 'transaction_id', 'type_id', 'type_name', 'document_id', 'related_document_id', 'status', 'admin_note', 'created_at', 'reviewed_at', 'reviewed_by'],
  ServiceSessions: ['session_id', 'student_id', 'student_email', 'student_name', 'class_name', 'document_id', 'recording_type', 'started_at', 'ended_at', 'duration_minutes', 'topic', 'result', 'staff_email', 'note', 'status', 'created_at', 'updated_at'],
  Notifications: ['notification_id', 'student_email', 'document_id', 'title', 'message', 'read', 'created_at', 'created_by'],
  EmailQueue: ['email_id', 'recipient', 'subject', 'body', 'status', 'attempts', 'last_error', 'created_at', 'sent_at'],
  AuditLog: ['audit_id', 'action', 'entity_type', 'entity_id', 'actor_email', 'detail_json', 'created_at']
});

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
  const response = {
    appName: settings.APP_NAME || APP.NAME,
    officeName: settings.OFFICE_NAME || 'Văn phòng Khoa',
    identity: identity,
    profile: null,
    types: types.map(publicType_),
    serverTime: iso_(new Date()),
    qrUrl: ScriptApp.getService().getUrl() + '?view=transaction'
  };

  if (identity.role === 'STUDENT') {
    const profile = findBy_(APP.SHEETS.STUDENTS, 'email', identity.email);
    response.profile = profile ? publicStudent_(profile) : null;
    response.dashboard = getStudentDashboard_(identity.email);
  } else {
    response.profile = { email: identity.email, fullName: identity.name || '' };
    response.dashboard = getAdminDashboard_();
  }
  return response;
}

function getIdentity_() {
  const email = normalizeEmail_(Session.getActiveUser().getEmail());
  if (!email) {
    throw new Error('AUTH_REQUIRED|Không xác định được tài khoản Google. Hãy đăng xuất tài khoản cá nhân và đăng nhập tài khoản TDTU.');
  }
  const admin = getAdminRecord_(email);
  if (admin) return { email: email, role: 'ADMIN', adminRole: admin.role || 'ADMIN', name: admin.name || '' };
  if (!isStudentEmail_(email)) {
    throw new Error('ACCESS_DENIED|Chỉ tài khoản sinh viên @student.tdtu.edu.vn hoặc quản trị viên được cấp quyền mới có thể truy cập.');
  }
  return { email: email, role: 'STUDENT', studentId: extractStudentId_(email) };
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
  if (fullName.length < 2) throw new Error('VALIDATION|Vui lòng nhập họ và tên.');
  if (className.length < 2) throw new Error('VALIDATION|Vui lòng nhập lớp.');
  if (!identity.studentId) throw new Error('STUDENT_ID_REQUIRED|Email không có MSSV dạng số. Vui lòng liên hệ quản trị viên để được gán MSSV.');

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

function getStudentDashboard_(email) {
  const documents = readTable_(APP.SHEETS.DOCUMENTS).filter(function(row) {
    return normalizeEmail_(row.student_email) === normalizeEmail_(email) && toBoolean_(row.active);
  });
  const transactions = readTable_(APP.SHEETS.TRANSACTIONS).filter(function(row) {
    return normalizeEmail_(row.student_email) === normalizeEmail_(email);
  });
  const notifications = readTable_(APP.SHEETS.NOTIFICATIONS).filter(function(row) {
    return normalizeEmail_(row.student_email) === normalizeEmail_(email);
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
  return {
    pendingTransactions: txs.filter(function(row) { return ['PENDING', 'PARTIAL'].indexOf(String(row.status)) !== -1; }).length,
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
    handover_mode: handoverMode
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
    if (documentCount || transactionItemCount) {
      throw new Error('IN_USE|Loại hồ sơ đã được sử dụng nên không thể xoá. Hãy chỉnh sửa và bỏ chọn “Đang sử dụng” để ngừng dùng loại hồ sơ này.');
    }

    deleteRow_(APP.SHEETS.TYPES, type._row);
    audit_('DELETE_DOCUMENT_TYPE', 'DocumentType', typeId, admin.email, { name: type.name });
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function createTransaction(payload) {
  const identity = assertStudent_();
  const profile = requireProfile_(identity.email);
  payload = payload || {};
  const transactionType = String(payload.transactionType || '').toUpperCase();
  if (['SUBMIT', 'RECEIVE', 'SUPPLEMENT'].indexOf(transactionType) === -1) {
    throw new Error('VALIDATION|Hình thức giao dịch không hợp lệ.');
  }
  const requestToken = sanitizeId_(payload.requestToken) || Utilities.getUuid();
  const selected = Array.isArray(payload.items) ? payload.items : [];
  if (!selected.length || selected.length > 20) throw new Error('VALIDATION|Vui lòng chọn từ 1 đến 20 hồ sơ.');

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
    notify_(identity.email, '', 'Đã ghi nhận yêu cầu', 'Yêu cầu ' + transaction.transaction_code + ' đang chờ cán bộ xác nhận.', identity.email, false);
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
  return txs.map(function(row) { return getTransactionResult_(row.transaction_id, identity.email, false); });
}

function listPendingTransactions() {
  assertAdmin_();
  const txs = readTable_(APP.SHEETS.TRANSACTIONS).filter(function(row) {
    return ['PENDING', 'PARTIAL'].indexOf(String(row.status)) !== -1;
  }).sort(sortDesc_('created_at'));
  return txs.map(function(row) { return getTransactionResult_(row.transaction_id, '', true); });
}

function reviewTransactionItem(payload) {
  payload = payload || {};
  return reviewTransactionItems({
    itemIds: [payload.itemId],
    decision: payload.decision,
    note: payload.note,
    sendEmail: payload.sendEmail,
    documentSelections: payload.documentId ? (function() { const result = {}; result[payload.itemId] = payload.documentId; return result; })() : {}
  });
}

function reviewTransactionItems(payload) {
  const admin = assertAdmin_();
  payload = payload || {};
  const decision = String(payload.decision || '').toUpperCase();
  if (['APPROVE', 'REJECT'].indexOf(decision) === -1) throw new Error('VALIDATION|Quyết định duyệt không hợp lệ.');
  const note = sanitizeText_(payload.note, 1000);
  if (decision === 'REJECT' && !note) throw new Error('VALIDATION|Vui lòng nhập lý do từ chối.');
  const itemIds = Array.isArray(payload.itemIds) ? payload.itemIds.map(sanitizeId_).filter(Boolean) : [];
  const uniqueIds = itemIds.filter(function(id, index) { return itemIds.indexOf(id) === index; });
  if (!uniqueIds.length || uniqueIds.length > 20) throw new Error('VALIDATION|Vui lòng chọn từ 1 đến 20 giấy tờ.');
  const selections = payload.documentSelections || {};

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const now = new Date();
    const items = uniqueIds.map(function(itemId) {
      const item = findBy_(APP.SHEETS.ITEMS, 'item_id', itemId);
      if (!item) throw new Error('NOT_FOUND|Không tìm thấy mục giao dịch ' + itemId + '.');
      return item;
    });
    const transactionId = items[0].transaction_id;
    if (items.some(function(item) { return item.transaction_id !== transactionId; })) {
      throw new Error('VALIDATION|Chỉ có thể xác nhận các giấy tờ trong cùng một yêu cầu.');
    }
    const transaction = findBy_(APP.SHEETS.TRANSACTIONS, 'transaction_id', transactionId);
    if (!transaction) throw new Error('DATA_ERROR|Không tìm thấy giao dịch cha.');
    items.forEach(function(item) {
      processTransactionItem_(transaction, item, decision, note, sanitizeId_(selections[item.item_id]), admin.email, now, toBoolean_(payload.sendEmail));
    });
    refreshTransactionStatus_(transactionId, admin.email);
    audit_('REVIEW_TRANSACTION_ITEMS', 'Transaction', transactionId, admin.email, { decision: decision, itemIds: uniqueIds });
    return getTransactionResult_(transactionId, '', true);
  } finally {
    lock.releaseLock();
  }
}

function processTransactionItem_(transaction, item, decision, note, selectedDocumentId, adminEmail, now, sendEmail) {
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
  const title = decision === 'APPROVE' ? 'Giao dịch đã được xác nhận' : 'Có mục giao dịch bị từ chối';
  const message = item.type_name + (note ? ': ' + note : (decision === 'APPROVE' ? ' đã được xác nhận tại quầy.' : ' chưa được xác nhận.'));
  notify_(transaction.student_email, documentId || item.related_document_id, title, message, adminEmail, sendEmail);
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
  else if (candidates.length > 1) throw new Error('VALIDATION|Có nhiều hồ sơ ' + item.type_name + ' đang chờ nhận. Vui lòng chọn đúng hồ sơ.');
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

function handOverDocument_(documentId, adminEmail, note, eventId) {
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
  return document;
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
      stepId: step.step_id, order: order, name: step.name, statusLabel: step.status_label,
      state: order < Number(document.current_step_order || 0) ? 'DONE' : order === Number(document.current_step_order || 0) ? 'CURRENT' : 'UPCOMING'
    };
  });
  result.events = events.map(function(event) { return publicEvent_(event, identity.role === 'ADMIN'); });
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
  appendRecord_(APP.SHEETS.DOCUMENTS, document);
  appendRecord_(APP.SHEETS.EVENTS, { event_id: 'evt_' + shortId_(), document_id: document.document_id, event_type: 'MANUAL_CREATED', from_step_id: '', to_step_id: document.current_step_id, status: status, public_note: document.public_note, internal_note: document.internal_note, created_at: now, created_by: admin.email });
  audit_('CREATE_MANUAL_DOCUMENT', 'Document', document.document_id, admin.email, { studentId: student.student_id, typeId: type.type_id });
  notify_(student.email, document.document_id, 'Văn phòng đã ghi nhận hồ sơ', document.type_name + ': ' + status, admin.email, toBoolean_(payload.sendEmail));
  return publicDocumentAdmin_(document);
}

function batchUpdateDocuments(payload) {
  const admin = assertAdmin_();
  payload = payload || {};
  const ids = Array.isArray(payload.documentIds) ? payload.documentIds.map(sanitizeId_).filter(Boolean) : [];
  if (!ids.length || ids.length > 100) throw new Error('VALIDATION|Chọn từ 1 đến 100 hồ sơ để cập nhật.');
  const status = sanitizeText_(payload.status, 120);
  if (!status) throw new Error('VALIDATION|Vui lòng chọn trạng thái mới.');
  const note = sanitizeText_(payload.publicNote, 1500);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const now = new Date();
    ids.forEach(function(id) {
      const document = findBy_(APP.SHEETS.DOCUMENTS, 'document_id', id);
      if (!document || !toBoolean_(document.active)) return;
      updateRow_(APP.SHEETS.DOCUMENTS, document._row, { status: status, public_note: note || document.public_note, storage_status: status === 'Đã bàn giao' ? 'HANDED_OVER' : document.storage_status, updated_at: now, updated_by: admin.email, version: Number(document.version || 0) + 1 });
      appendRecord_(APP.SHEETS.EVENTS, { event_id: 'evt_' + shortId_(), document_id: id, event_type: 'BATCH_UPDATED', from_step_id: document.current_step_id, to_step_id: document.current_step_id, status: status, public_note: note, internal_note: '', created_at: now, created_by: admin.email });
      notify_(document.student_email, id, 'Cập nhật hồ sơ ' + document.document_code, note || ('Trạng thái mới: ' + status), admin.email, toBoolean_(payload.sendEmail));
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
    if (payload.version != null && Number(payload.version) !== Number(document.version || 0)) {
      throw new Error('VERSION_CONFLICT|Hồ sơ đã được người khác cập nhật. Vui lòng tải lại dữ liệu.');
    }
    const steps = getWorkflowSteps_(document.workflow_version_id);
    const step = payload.stepId ? steps.find(function(row) { return row.step_id === payload.stepId; }) : null;
    const explicitStatus = sanitizeText_(payload.status, 120);
    const status = explicitStatus || (step ? step.status_label : document.status);
    const publicNote = sanitizeText_(payload.publicNote, 1500);
    const internalNote = sanitizeText_(payload.internalNote, 1500);
    const expectedAt = parseDateInput_(payload.expectedAt);
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
    notify_(document.student_email, documentId, 'Cập nhật hồ sơ ' + document.document_code,
      publicNote || ('Trạng thái mới: ' + status), admin.email, toBoolean_(payload.sendEmail));
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
  const reason = sanitizeText_(payload.reason, 1000);
  if (!reason) throw new Error('VALIDATION|Vui lòng nhập lý do hủy hồ sơ.');
  const now = new Date();
  updateRow_(APP.SHEETS.DOCUMENTS, document._row, { status: 'Đã hủy', active: false, public_note: reason, updated_at: now, updated_by: admin.email, version: Number(document.version || 0) + 1 });
  appendRecord_(APP.SHEETS.EVENTS, { event_id: 'evt_' + shortId_(), document_id: document.document_id, event_type: 'CANCELLED', from_step_id: document.current_step_id, to_step_id: document.current_step_id, status: 'Đã hủy', public_note: reason, internal_note: '', created_at: now, created_by: admin.email });
  notify_(document.student_email, document.document_id, 'Hồ sơ đã hủy', reason, admin.email, toBoolean_(payload.sendEmail));
  audit_('CANCEL_DOCUMENT', 'Document', document.document_id, admin.email, { reason: reason });
  return { ok: true };
}

function listWorkflows() {
  assertAdmin_();
  const versions = readTable_(APP.SHEETS.WORKFLOW_VERSIONS);
  return versions.map(function(version) {
    return {
      workflowVersionId: version.workflow_version_id,
      name: version.name,
      version: Number(version.version || 1),
      active: toBoolean_(version.active),
      steps: getWorkflowSteps_(version.workflow_version_id).map(function(step) {
        return { stepId: step.step_id, order: Number(step.step_order), name: step.name, statusLabel: step.status_label };
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
  appendRecord_(APP.SHEETS.WORKFLOW_VERSIONS, { workflow_version_id: workflowId, name: name, version: Number(payload.version || 1), active: true, created_at: now, created_by: admin.email });
  steps.forEach(function(item, index) {
    const stepName = sanitizeText_(item.name, 160);
    if (!stepName) throw new Error('VALIDATION|Tên bước xử lý không được để trống.');
    appendRecord_(APP.SHEETS.WORKFLOW_STEPS, { step_id: workflowId + '_s' + (index + 1), workflow_version_id: workflowId, step_order: index + 1, name: stepName, status_label: sanitizeText_(item.statusLabel, 120) || stepName, created_at: now });
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
  if (!topic || !result) throw new Error('VALIDATION|Vui lòng nhập nội dung trao đổi và kết quả xử lý.');
  updateRow_(APP.SHEETS.SERVICES, row._row, { ended_at: now, duration_minutes: duration, topic: topic, result: result, note: sanitizeText_(payload.note, 1000), status: 'COMPLETED', updated_at: now });
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
  if (!topic || !result) throw new Error('VALIDATION|Vui lòng nhập nội dung trao đổi và kết quả xử lý.');
  const now = new Date();
  const record = {
    session_id: 'svc_' + shortId_(), student_id: student.student_id, student_email: student.email,
    student_name: student.full_name, class_name: student.class_name, document_id: sanitizeId_(payload.documentId),
    recording_type: 'MANUAL', started_at: started, ended_at: ended,
    duration_minutes: Math.max(0, Math.round((ended.getTime() - started.getTime()) / 60000)),
    topic: topic, result: result, staff_email: admin.email, note: sanitizeText_(payload.note, 1000),
    status: 'COMPLETED', created_at: now, updated_at: now
  };
  appendRecord_(APP.SHEETS.SERVICES, record);
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
  const transactions = readTable_(APP.SHEETS.TRANSACTIONS).filter(function(row) { return within(row.created_at); });
  const allItems = readTable_(APP.SHEETS.ITEMS);
  const items = allItems.filter(function(row) { return within(row.created_at); });
  const approvedItems = allItems.filter(function(row) { return String(row.status) === 'APPROVED' && within(row.reviewed_at); });
  const transactionById = {};
  readTable_(APP.SHEETS.TRANSACTIONS).forEach(function(row) { transactionById[row.transaction_id] = row; });
  const documents = readTable_(APP.SHEETS.DOCUMENTS).filter(function(row) { return within(row.submitted_at); });
  const events = readTable_(APP.SHEETS.EVENTS);
  const services = readTable_(APP.SHEETS.SERVICES).filter(function(row) { return within(row.started_at) && String(row.status) === 'COMPLETED'; });
  const completedDocs = documents.filter(function(row) { return ['Đã hoàn thành', 'Đã bàn giao'].indexOf(String(row.status)) !== -1; });
  const processingDays = completedDocs.map(function(row) {
    const completedEvent = events.filter(function(event) {
      return event.document_id === row.document_id && ['Đã hoàn thành', 'Đã bàn giao'].indexOf(String(event.status)) !== -1;
    }).sort(sortAsc_('created_at'))[0];
    return completedEvent ? Math.max(0, (dateValue_(completedEvent.created_at) - dateValue_(row.submitted_at)) / 86400000) : 0;
  });
  const totalMinutes = services.reduce(function(sum, row) { return sum + Number(row.duration_minutes || 0); }, 0);
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
    storedDocuments: readTable_(APP.SHEETS.DOCUMENTS).filter(function(row) { return String(row.storage_status) === 'AT_OFFICE' && toBoolean_(row.active); }).length,
    processingDocuments: readTable_(APP.SHEETS.DOCUMENTS).filter(function(row) { return ['Đã hoàn thành', 'Đã bàn giao', 'Đã hủy'].indexOf(String(row.status)) === -1 && toBoolean_(row.active); }).length,
    supplementDocuments: readTable_(APP.SHEETS.DOCUMENTS).filter(function(row) { return String(row.status) === 'Yêu cầu bổ sung' && toBoolean_(row.active); }).length,
    overdueDocuments: readTable_(APP.SHEETS.DOCUMENTS).filter(function(row) { return row.expected_at && dateValue_(row.expected_at) < new Date() && ['Đã hoàn thành', 'Đã bàn giao', 'Đã hủy'].indexOf(String(row.status)) === -1; }).length,
    completedDocuments: completedDocs.length,
    waitingPickup: readTable_(APP.SHEETS.DOCUMENTS).filter(function(row) { return String(row.status) === 'Chờ sinh viên đến nhận'; }).length,
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
  ensureSystemInitialized_();
  const admin = assertAdmin_();
  const spreadsheet = getSpreadsheet_();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheet.getId());
  audit_('SETUP_SYSTEM', 'System', spreadsheet.getId(), admin.email, { schemaVersion: 2 });
  return { ok: true, spreadsheetId: spreadsheet.getId(), spreadsheetUrl: spreadsheet.getUrl(), webAppUrl: ScriptApp.getService().getUrl() };
}

function ensureSystemInitialized_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = getSpreadsheet_();
    Object.keys(HEADERS).forEach(function(name) {
      let sheet = spreadsheet.getSheetByName(name);
      if (!sheet) sheet = spreadsheet.insertSheet(name);
      ensureSheetSchema_(sheet, name);
    });
    if (!findBy_(APP.SHEETS.ADMINS, 'email', APP.DEFAULT_ADMIN)) {
      appendRecord_(APP.SHEETS.ADMINS, { email: APP.DEFAULT_ADMIN, name: 'Nguyễn Thái Khôi', role: 'SUPER_ADMIN', active: true, created_at: new Date(), updated_at: new Date() });
    }
    migrateSystemData_();
    seedIfEmpty_();
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheet.getId());
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
  });
  const version = findBy_(APP.SHEETS.SETTINGS, 'key', 'SCHEMA_VERSION');
  if (version) {
    if (String(version.value) !== '2') updateRow_(APP.SHEETS.SETTINGS, version._row, { value: '2', updated_at: new Date(), updated_by: APP.DEFAULT_ADMIN });
  } else {
    appendRecord_(APP.SHEETS.SETTINGS, { key: 'SCHEMA_VERSION', value: '2', description: 'Phiên bản cấu trúc dữ liệu', updated_at: new Date(), updated_by: APP.DEFAULT_ADMIN });
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

function seedIfEmpty_() {
  const now = new Date();
  [['APP_NAME', APP.NAME, 'Tên hiển thị của ứng dụng'], ['OFFICE_NAME', 'Văn phòng Khoa', 'Tên đơn vị vận hành'], ['TIMEZONE', APP.TIMEZONE, 'Múi giờ vận hành'], ['SCHEMA_VERSION', '2', 'Phiên bản cấu trúc dữ liệu']].forEach(function(row) {
    if (!findBy_(APP.SHEETS.SETTINGS, 'key', row[0])) {
      appendRecord_(APP.SHEETS.SETTINGS, { key: row[0], value: row[1], description: row[2], updated_at: now, updated_by: APP.DEFAULT_ADMIN });
    }
  });
  if (readTable_(APP.SHEETS.WORKFLOW_VERSIONS).length === 0) {
    appendRecord_(APP.SHEETS.WORKFLOW_VERSIONS, { workflow_version_id: 'wf_nckh_v1', name: 'Quy trình xử lý hồ sơ', version: 1, active: true, created_at: now, created_by: APP.DEFAULT_ADMIN });
  }
  if (readTable_(APP.SHEETS.WORKFLOW_STEPS).length === 0) {
    [['Tiếp nhận hồ sơ', 'Đã tiếp nhận'], ['Kiểm tra hồ sơ', 'Đang kiểm tra hồ sơ'], ['Trình duyệt hồ sơ', 'Đang trình duyệt'], ['Chờ kết quả phê duyệt', 'Chờ phê duyệt'], ['Hoàn tất xử lý', 'Đã hoàn thành']].forEach(function(row, index) {
      appendRecord_(APP.SHEETS.WORKFLOW_STEPS, { step_id: 'wf_nckh_v1_s' + (index + 1), workflow_version_id: 'wf_nckh_v1', step_order: index + 1, name: row[0], status_label: row[1], created_at: now });
    });
  }
  const typeSeeds = [
    ['nckh_registration', 'Hồ sơ đăng ký NCKH', true, 'BOTH'],
    ['topic_registration', 'Hồ sơ đăng ký đề tài', true, 'BOTH'],
    ['topic_acceptance', 'Hồ sơ nghiệm thu đề tài', true, 'BOTH'],
    ['degree', 'Bằng tốt nghiệp', false, 'BOTH'],
    ['transcript', 'Bảng điểm', false, 'BOTH'],
    ['certificate', 'Chứng chỉ', false, 'BOTH'],
    ['request_form', 'Đơn đề nghị', true, 'BOTH'],
    ['confirmation', 'Giấy xác nhận', true, 'BOTH'],
    ['internship_intro', 'Giấy giới thiệu thực tập', false, 'RECEIVE'],
    ['student_confirmation_visa', 'Giấy xác nhận sinh viên (Gia hạn visa)', false, 'RECEIVE'],
    ['student_confirmation_internal_internship', 'Giấy xác nhận sinh viên (Thực tập trong trường)', false, 'RECEIVE'],
    ['scholarship_certificate_2025_2026_hk1', 'Giấy khen Học bổng KKHT HK1/2025-2026', false, 'RECEIVE'],
    ['student_research_award_2025_2026', 'Hồ sơ khen thưởng NCKHSV 2025-2026', true, 'SUBMIT'],
    ['graduation_thesis_bonus_or_replacement', 'Hồ sơ cộng điểm KLTN/Thay thế tốt nghiệp', true, 'SUBMIT'],
    ['enterprise_scholarship', 'Hồ sơ xét học bổng doanh nghiệp', true, 'SUBMIT']
  ];
  typeSeeds.forEach(function(row, index) {
    if (!findBy_(APP.SHEETS.TYPES, 'type_id', row[0])) {
      appendRecord_(APP.SHEETS.TYPES, {
        type_id: row[0], name: row[1], description: row[1], tracks_progress: row[2],
        workflow_version_id: row[2] ? 'wf_nckh_v1' : '', active: true, sort_order: index + 1,
        created_at: now, updated_at: now, handover_mode: row[3]
      });
    }
  });
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || APP.SPREADSHEET_ID;
  if (id) return SpreadsheetApp.openById(id);
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (error) {}
  throw new Error('SETUP_REQUIRED|Chưa cấu hình Google Sheets cho ứng dụng.');
}

function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('SHEET_MISSING|Không tìm thấy tab dữ liệu ' + name + '.');
  return sheet;
}

function readTable_(name) {
  const sheet = getSheet_(name);
  const lastRow = sheet.getLastRow();
  const headers = HEADERS[name];
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.filter(function(row) { return row.some(function(value) { return value !== '' && value != null; }); }).map(function(row, index) {
    const record = { _row: index + 2 };
    headers.forEach(function(header, column) { record[header] = row[column]; });
    return record;
  });
}

function appendRecord_(name, record) {
  const sheet = getSheet_(name);
  const headers = HEADERS[name];
  sheet.appendRow(headers.map(function(header) { return record[header] == null ? '' : record[header]; }));
}

function updateRow_(name, rowNumber, patch) {
  const sheet = getSheet_(name);
  const headers = HEADERS[name];
  const range = sheet.getRange(rowNumber, 1, 1, headers.length);
  const values = range.getValues()[0];
  headers.forEach(function(header, index) {
    if (Object.prototype.hasOwnProperty.call(patch, header)) values[index] = patch[header] == null ? '' : patch[header];
  });
  range.setValues([values]);
}

function deleteRow_(name, rowNumber) {
  getSheet_(name).deleteRow(rowNumber);
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

function getTransactionResult_(transactionId, ownerEmail, adminView) {
  const transaction = findBy_(APP.SHEETS.TRANSACTIONS, 'transaction_id', transactionId);
  if (!transaction) throw new Error('NOT_FOUND|Không tìm thấy giao dịch.');
  if (!adminView && normalizeEmail_(transaction.student_email) !== normalizeEmail_(ownerEmail)) throw new Error('ACCESS_DENIED|Bạn không có quyền xem giao dịch này.');
  const items = readTable_(APP.SHEETS.ITEMS).filter(function(row) { return row.transaction_id === transactionId; });
  const documents = adminView && transaction.transaction_type === 'RECEIVE' ? readTable_(APP.SHEETS.DOCUMENTS) : [];
  return {
    transactionId: transaction.transaction_id, code: transaction.transaction_code, studentId: transaction.student_id,
    studentEmail: transaction.student_email, studentName: transaction.student_name, className: transaction.class_name,
    type: transaction.transaction_type, status: transaction.status, note: transaction.student_note || '',
    createdAt: iso_(transaction.created_at), updatedAt: iso_(transaction.updated_at),
    items: items.map(function(item) {
      const result = { itemId: item.item_id, typeId: item.type_id, typeName: item.type_name, documentId: item.document_id || '', relatedDocumentId: item.related_document_id || '', status: item.status, adminNote: item.admin_note || '', reviewedAt: iso_(item.reviewed_at), reviewedBy: item.reviewed_by || '' };
      if (adminView && transaction.transaction_type === 'RECEIVE' && !item.document_id && String(item.status) === 'PENDING') {
        result.pickupCandidates = documents.filter(function(document) {
          return normalizeEmail_(document.student_email) === normalizeEmail_(transaction.student_email) && document.type_id === item.type_id && String(document.status) === 'Chờ sinh viên đến nhận' && toBoolean_(document.active);
        }).map(function(document) { return { documentId: document.document_id, code: document.document_code, updatedAt: iso_(document.updated_at) }; });
      }
      return result;
    })
  };
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

function notify_(recipient, documentId, title, message, actor, sendEmail) {
  const notification = { notification_id: 'ntf_' + shortId_(), student_email: normalizeEmail_(recipient), document_id: documentId || '', title: sanitizeText_(title, 200), message: sanitizeText_(message, 2000), read: false, created_at: new Date(), created_by: actor };
  appendRecord_(APP.SHEETS.NOTIFICATIONS, notification);
  if (sendEmail) queueAndSendEmail_(recipient, title, message);
}

function queueAndSendEmail_(recipient, subject, body) {
  const row = { email_id: 'mail_' + shortId_(), recipient: normalizeEmail_(recipient), subject: sanitizeText_(subject, 200), body: sanitizeText_(body, 5000), status: 'PENDING', attempts: 0, last_error: '', created_at: new Date(), sent_at: '' };
  appendRecord_(APP.SHEETS.EMAIL_QUEUE, row);
  row._row = getSheet_(APP.SHEETS.EMAIL_QUEUE).getLastRow();
  sendQueuedEmail_(row);
}

function sendQueuedEmail_(row) {
  try {
    MailApp.sendEmail({ to: row.recipient, subject: row.subject, htmlBody: '<div style="font-family:Arial,sans-serif;line-height:1.6"><h2 style="color:#005AAB">' + escapeHtml_(row.subject) + '</h2><p>' + escapeHtml_(row.body).replace(/\n/g, '<br>') + '</p><p style="color:#6B7280">' + APP.NAME + '</p></div>' });
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
  if (!profile || !toBoolean_(profile.active) || !profile.full_name || !profile.class_name) throw new Error('PROFILE_REQUIRED|Vui lòng hoàn thiện họ tên và lớp trong phần Tài khoản trước khi giao dịch.');
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
function publicType_(row) { return { typeId: row.type_id, name: row.name, description: row.description || '', tracksProgress: toBoolean_(row.tracks_progress), workflowVersionId: row.workflow_version_id || '', active: toBoolean_(row.active), sortOrder: Number(row.sort_order || 0), handoverMode: normalizeHandoverMode_(row.handover_mode || 'BOTH') }; }
function publicDocument_(row) { return { documentId: row.document_id, code: row.document_code, typeId: row.type_id, typeName: row.type_name, status: row.status, storageStatus: row.storage_status, submittedAt: iso_(row.submitted_at), expectedAt: iso_(row.expected_at), updatedAt: iso_(row.updated_at), publicNote: row.public_note || '', currentStepOrder: Number(row.current_step_order || 0), version: Number(row.version || 0) }; }
function publicDocumentAdmin_(row) { const result = publicDocument_(row); result.studentId = row.student_id; result.studentEmail = row.student_email; result.studentName = row.student_name; result.className = row.class_name; result.internalNote = row.internal_note || ''; result.workflowVersionId = row.workflow_version_id || ''; result.currentStepId = row.current_step_id || ''; return result; }
function publicEvent_(row, adminView) { const result = { eventId: row.event_id, type: row.event_type, status: row.status, publicNote: row.public_note || '', createdAt: iso_(row.created_at), createdBy: row.created_by || '', toStepId: row.to_step_id || '' }; if (adminView) result.internalNote = row.internal_note || ''; return result; }
function publicService_(row) { return { sessionId: row.session_id, studentId: row.student_id, studentEmail: row.student_email, studentName: row.student_name, className: row.class_name, documentId: row.document_id || '', recordingType: row.recording_type, startedAt: iso_(row.started_at), endedAt: iso_(row.ended_at), durationMinutes: Number(row.duration_minutes || 0), topic: row.topic || '', result: row.result || '', staffEmail: row.staff_email, note: row.note || '', status: row.status }; }
function publicNotification_(row) { return { notificationId: row.notification_id, documentId: row.document_id || '', title: row.title, message: row.message, read: toBoolean_(row.read), createdAt: iso_(row.created_at) }; }

function isStudentEmail_(email) { return new RegExp('^[^@\\s]+@' + APP.STUDENT_DOMAIN.replace(/\./g, '\\.') + '$', 'i').test(normalizeEmail_(email)); }
function extractStudentId_(email) { const local = normalizeEmail_(email).split('@')[0]; return /^\d{5,20}$/.test(local) ? local : ''; }
function normalizeEmail_(value) { return String(value || '').trim().toLowerCase(); }
function sanitizeText_(value, maxLength) { return String(value == null ? '' : value).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength || 1000); }
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
