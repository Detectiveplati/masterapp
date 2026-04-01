'use strict';

(function () {
  const STORAGE_KEY = 'foodsafety_lang';
  const listeners = [];

  const DICT = {
    en: {
      toggle_en: 'EN',
      toggle_zh: '中文',
      lang_toggle_label: 'Food Safety Language',
      checklist_hero_title: 'Monthly Food Safety Checklist',
      checklist_hero_body: '',
      checklist_progress: 'Progress',
      checklist_checked_cells: 'Checked Cells',
      checklist_status: 'Status',
      checklist_weeks: 'Weeks',
      checklist_month: 'Month',
      checklist_unit: 'Unit',
      checklist_template: 'Checklist',
      checklist_reload: 'Reload Month',
      checklist_reopen: 'Reopen',
      checklist_save: 'Save Draft',
      checklist_finalize: 'Finalize Month',
      checklist_saving: 'Saving…',
      checklist_unsaved: 'Unsaved changes',
      checklist_saved: 'All changes saved',
      checklist_finalized_status: 'Finalized',
      checklist_draft_status: 'Draft',
      checklist_last_saved_by: 'Last saved by',
      checklist_finalized_by: 'Finalized by',
      checklist_on: 'on',
      checklist_for: 'for',
      checklist_no_saves: 'No saves recorded yet for this month.',
      checklist_sections_word: 'sections',
      checklist_days_word: 'days',
      checklist_weeks_word: 'weeks',
      checklist_weekly: 'Weekly',
      checklist_daily: 'Daily',
      checklist_checked_word: 'checked',
      checklist_week: 'Week',
      checklist_day: 'Day',
      checklist_days: 'Days',
      checklist_item_header: 'Checklist Item',
      checklist_bulk_row: 'Check All',
      checklist_bulk_toggle: 'Check all for this day',
      checklist_sheet: 'checklist',
      checklist_section_hint: 'Use the arrow buttons to move across the dates without relying on swipe scrolling.',
      checklist_weekly_section: 'Weekly section',
      checklist_daily_section: 'Daily section',
      checklist_weekly_slots: 'weekly slots',
      checklist_day_columns: 'day columns',
      checklist_last_edit: 'Last section edit',
      checklist_not_saved_yet: 'Not saved yet',
      checklist_draft_saved: 'Draft saved',
      checklist_month_finalized: 'Month finalized',
      checklist_month_reopened: 'Month reopened',
      checklist_date_hint: 'Use arrows to move across the dates',
      checklist_remarks: 'Remarks / Maintenance Notes',
      checklist_remarks_placeholder: 'Record any issue, missing part, maintenance request, or note for this section.',
      foodsafety_home_title: 'Food Safety',
      foodsafety_home_nc_title: 'Non-Conformance Reports',
      foodsafety_home_nc_body: 'Log new food safety non-conformances and browse all open or resolved reports across kitchen units.',
      foodsafety_home_nc_go: 'Open NC Reports →',
      foodsafety_home_checklists_title: 'Monthly Cleaning Checklists',
      foodsafety_home_checklists_body: 'Open a full month sheet, tick any day as needed, save drafts, and finalize when the month is ready for review.',
      foodsafety_home_checklists_go: 'Open Monthly Checklist →',
      foodsafety_home_pest_title: 'Rat Trap Surveillance',
      foodsafety_home_pest_body: 'Record findings, manage trap stations, and view weekly pest control inspection reports.',
      foodsafety_home_pest_go: 'Open Module →',
      foodsafety_home_fhc_title: 'Employee Certification & Licence Tracker',
      foodsafety_home_fhc_body: 'Track food handler certificates, monitor expiry dates, and flag upcoming renewals.',
      foodsafety_home_fhc_go: 'View Tracker →',
      nc_hub_title: 'Non-Conformance Reports',
      nc_hub_body: 'Log new food safety incidents or browse existing NC records.',
      nc_hub_log_title: 'Log NC',
      nc_hub_log_body: 'Submit a new food safety non-conformance report for any kitchen unit.',
      nc_hub_log_go: 'New Report →',
      nc_hub_view_title: 'View NCs',
      nc_hub_view_body: 'Browse all open and resolved non-conformance reports. Filter by unit or status.',
      nc_hub_view_go: 'View All →',
      nc_form_title: 'New NC',
      nc_form_body: 'Fill in all required fields marked with *',
      nc_form_unit: 'Unit/Area',
      nc_form_zone: 'Kitchen Zone',
      nc_form_specific: 'Specific Location',
      nc_form_description: 'Non-Conformance Description',
      nc_form_priority: 'Priority',
      nc_form_photo: 'Photo',
      nc_form_name: 'Your Name',
      nc_form_cancel: 'Cancel',
      nc_form_submit: 'Submit NC',
      nc_submitting: 'Submitting…',
      nc_submit_failed: 'Failed to submit',
      nc_submitted_ok: '✅ NC submitted successfully! Redirecting…',
      generic_error: '❌ Error: ',
      nc_none_found: 'No NCs found.',
      nc_urgent: 'Urgent',
      delete_report: 'Delete report',
      delete: 'Delete',
      reported_by: 'Reported by',
      delete_nc_confirm: 'Delete this NC? This cannot be undone.',
      delete_failed: 'Delete failed',
      no_nc_id: 'No NC ID provided',
      status_open: 'Open',
      status_resolved: 'Resolved',
      reported: 'Reported',
      by: 'by',
      reported_by_label: 'Reported By',
      resolution: 'Resolution',
      resolved_by: 'Resolved By',
      resolved_at: 'Resolved At',
      notes: 'Notes',
      report_photo: 'Report Photo',
      resolution_photo: 'Resolution Photo',
      photo_log: 'Photo Log',
      no_photos_attached: 'No photos attached to this report.',
      photos: 'photos',
      error_loading_reports: 'Error loading reports: ',
      error_loading_nc: 'Error loading NC: ',
      resolve_failed: 'Failed to resolve',
      resolved_ok: '✅ Marked as resolved! Reloading…',
      priority_normal: 'Normal',
      fhc_yes: 'Yes',
      fhc_no: 'No',
      fhc_loading: 'Loading…',
      fhc_record_updated: 'Record updated.',
      fhc_record_created: 'Record created.',
      fhc_delete_confirm_prefix: 'Delete record for ',
      fhc_delete_confirm_suffix: '? This cannot be undone.',
      fhc_delete_failed: 'Delete failed: ',
      fhc_not_valid: '❌ Not Valid',
      fhc_expiring_soon: '⚠️ Expiring Soon',
      fhc_valid_badge: '✅ Valid',
      nc_list_title: 'Non-Conformance Reports',
      nc_list_log: '+ Log New NC',
      nc_list_filter_unit: 'Filter by Unit',
      nc_list_filter_status: 'Filter by Status',
      nc_detail_resolution_title: 'Log Resolution',
      nc_detail_resolved_by: 'Resolved By',
      nc_detail_resolution_photo: 'Resolution Photo',
      nc_detail_resolution_notes: 'Resolution Notes',
      nc_detail_back_list: '← Back to List',
      nc_detail_delete_report: '🗑 Delete Report',
      nc_detail_mark_resolved: '✔ Mark as Resolved',
      fhc_list_title: 'Employee Certification & Licence Tracker',
      fhc_add_record: '➕ Add Record',
      fhc_import_csv: '📥 Import CSV',
      fhc_print_pdf: '🖨 Print / PDF',
      fhc_back: '← Back',
      fhc_total: 'Total',
      fhc_valid: 'Valid',
      fhc_expiring: 'Expiring ≤60d',
      fhc_invalid: 'Not Valid',
      fhc_search_placeholder: '🔍 Search employee…',
      fhc_all_entities: 'All Entities',
      fhc_all_validity: 'All Validity',
      fhc_validity_valid: 'Valid',
      fhc_validity_expiring: 'Expiring Soon',
      fhc_validity_invalid: 'Not Valid',
      fhc_refresh: '🔄 Refresh',
      fhc_form_add: '🪪 Add Certificate Record',
      fhc_form_back: '← Back to List',
      fhc_business_entity: 'Business Entity *',
      fhc_employee_name: 'Employee Name *',
      fhc_prev_cert_date: 'Previous Cert Date',
      fhc_start_date: 'Start Date *',
      fhc_expiry_date: 'Expiry Date *',
      fhc_refresher: 'This is a refresher course',
      fhc_cancelled: 'Certificate cancelled / revoked',
      fhc_cancel_reason: 'Cancellation Reason',
      fhc_remarks: 'Remarks',
      fhc_save_record: '💾 Save Record',
      fhc_cancel: 'Cancel',
      fhc_delete: '🗑 Delete'
    },
    zh: {
      toggle_en: 'EN',
      toggle_zh: '中文',
      lang_toggle_label: '食品安全语言',
      checklist_hero_title: '每月食品安全检查表',
      checklist_hero_body: '',
      checklist_progress: '完成进度',
      checklist_checked_cells: '已勾选格数',
      checklist_status: '状态',
      checklist_weeks: '周数',
      checklist_month: '月份',
      checklist_unit: '单位',
      checklist_template: '表单',
      checklist_reload: '重新载入',
      checklist_reopen: '重新开启',
      checklist_save: '保存草稿',
      checklist_finalize: '完成本月',
      checklist_saving: '保存中…',
      checklist_unsaved: '有未保存更改',
      checklist_saved: '已保存',
      checklist_finalized_status: '已完成',
      checklist_draft_status: '草稿',
      checklist_last_saved_by: '最后保存人',
      checklist_finalized_by: '完成人',
      checklist_on: '于',
      checklist_for: '适用于',
      checklist_no_saves: '本月尚未有保存记录。',
      checklist_sections_word: '区域',
      checklist_days_word: '天',
      checklist_weeks_word: '周',
      checklist_weekly: '每周',
      checklist_daily: '每日',
      checklist_checked_word: '已勾选',
      checklist_week: '周',
      checklist_day: '日',
      checklist_days: '日期',
      checklist_item_header: '检查项目',
      checklist_bulk_row: '整日全选',
      checklist_bulk_toggle: '勾选该日全部项目',
      checklist_sheet: '检查表',
      checklist_section_hint: '使用箭头切换日期，无需依赖横向滑动。',
      checklist_weekly_section: '每周区域',
      checklist_daily_section: '每日区域',
      checklist_weekly_slots: '每周栏位',
      checklist_day_columns: '日期栏位',
      checklist_last_edit: '最后编辑',
      checklist_not_saved_yet: '尚未保存',
      checklist_draft_saved: '草稿已保存',
      checklist_month_finalized: '本月已完成',
      checklist_month_reopened: '本月已重新开启',
      checklist_date_hint: '使用箭头切换日期',
      checklist_remarks: '备注 / 维修说明',
      checklist_remarks_placeholder: '记录任何问题、缺件、维修要求或该区域备注。',
      foodsafety_home_title: '食品安全',
      foodsafety_home_nc_title: '不符合项报告',
      foodsafety_home_nc_body: '记录新的食品安全不符合项，并查看所有厨房单位的开启或已解决记录。',
      foodsafety_home_nc_go: '打开不符合项 →',
      foodsafety_home_checklists_title: '每月清洁检查表',
      foodsafety_home_checklists_body: '打开整个月表，按需要勾选任何日期，保存草稿，并在月底准备好后完成。',
      foodsafety_home_checklists_go: '打开月度检查表 →',
      foodsafety_home_pest_title: '老鼠夹监测',
      foodsafety_home_pest_body: '记录发现情况、管理站点，并查看每周虫害控制检查报告。',
      foodsafety_home_pest_go: '打开模块 →',
      foodsafety_home_fhc_title: '员工证书与执照追踪',
      foodsafety_home_fhc_body: '追踪食品处理证书，监控到期日，并标示即将到期项目。',
      foodsafety_home_fhc_go: '查看追踪 →',
      nc_hub_title: '不符合项报告',
      nc_hub_body: '记录新的食品安全事件或浏览现有不符合项记录。',
      nc_hub_log_title: '记录不符合项',
      nc_hub_log_body: '为任何厨房单位提交新的食品安全不符合项报告。',
      nc_hub_log_go: '新报告 →',
      nc_hub_view_title: '查看不符合项',
      nc_hub_view_body: '查看所有开启和已解决的不符合项报告，并按单位或状态筛选。',
      nc_hub_view_go: '查看全部 →',
      nc_form_title: '新增不符合项',
      nc_form_body: '请填写所有标有 * 的必填栏位',
      nc_form_unit: '单位 / 区域',
      nc_form_zone: '厨房区域',
      nc_form_specific: '具体位置',
      nc_form_description: '不符合项说明',
      nc_form_priority: '优先级',
      nc_form_photo: '照片',
      nc_form_name: '您的姓名',
      nc_form_cancel: '取消',
      nc_form_submit: '提交不符合项',
      nc_submitting: '提交中…',
      nc_submit_failed: '提交失败',
      nc_submitted_ok: '✅ 不符合项已提交，正在跳转…',
      generic_error: '❌ 错误：',
      nc_none_found: '未找到不符合项记录。',
      nc_urgent: '紧急',
      delete_report: '删除报告',
      delete: '删除',
      reported_by: '报告人',
      delete_nc_confirm: '要删除此不符合项吗？此操作无法撤销。',
      delete_failed: '删除失败',
      no_nc_id: '未提供不符合项编号',
      status_open: '开启',
      status_resolved: '已解决',
      reported: '报告于',
      by: '由',
      reported_by_label: '报告人',
      resolution: '解决措施',
      resolved_by: '解决人',
      resolved_at: '解决时间',
      notes: '备注',
      report_photo: '报告照片',
      resolution_photo: '解决照片',
      photo_log: '照片记录',
      no_photos_attached: '此报告没有附加照片。',
      photos: '张照片',
      error_loading_reports: '加载报告时出错：',
      error_loading_nc: '加载不符合项时出错：',
      resolve_failed: '提交解决失败',
      resolved_ok: '✅ 已标记为已解决，正在重新载入…',
      priority_normal: '普通',
      fhc_yes: '是',
      fhc_no: '否',
      fhc_loading: '加载中…',
      fhc_record_updated: '记录已更新。',
      fhc_record_created: '记录已创建。',
      fhc_delete_confirm_prefix: '要删除 ',
      fhc_delete_confirm_suffix: ' 的记录吗？此操作无法撤销。',
      fhc_delete_failed: '删除失败：',
      fhc_not_valid: '❌ 无效',
      fhc_expiring_soon: '⚠️ 即将到期',
      fhc_valid_badge: '✅ 有效',
      nc_list_title: '不符合项报告',
      nc_list_log: '+ 新增不符合项',
      nc_list_filter_unit: '按单位筛选',
      nc_list_filter_status: '按状态筛选',
      nc_detail_resolution_title: '记录解决措施',
      nc_detail_resolved_by: '解决人',
      nc_detail_resolution_photo: '解决照片',
      nc_detail_resolution_notes: '解决备注',
      nc_detail_back_list: '← 返回列表',
      nc_detail_delete_report: '🗑 删除报告',
      nc_detail_mark_resolved: '✔ 标记为已解决',
      fhc_list_title: '员工证书与执照追踪',
      fhc_add_record: '➕ 新增记录',
      fhc_import_csv: '📥 导入 CSV',
      fhc_print_pdf: '🖨 打印 / PDF',
      fhc_back: '← 返回',
      fhc_total: '总数',
      fhc_valid: '有效',
      fhc_expiring: '60天内到期',
      fhc_invalid: '无效',
      fhc_search_placeholder: '🔍 搜索员工…',
      fhc_all_entities: '所有单位',
      fhc_all_validity: '所有有效状态',
      fhc_validity_valid: '有效',
      fhc_validity_expiring: '即将到期',
      fhc_validity_invalid: '无效',
      fhc_refresh: '🔄 刷新',
      fhc_form_add: '🪪 新增证书记录',
      fhc_form_back: '← 返回列表',
      fhc_business_entity: '业务单位 *',
      fhc_employee_name: '员工姓名 *',
      fhc_prev_cert_date: '上一张证书日期',
      fhc_start_date: '开始日期 *',
      fhc_expiry_date: '到期日期 *',
      fhc_refresher: '这是复训课程',
      fhc_cancelled: '证书已取消 / 吊销',
      fhc_cancel_reason: '取消原因',
      fhc_remarks: '备注',
      fhc_save_record: '💾 保存记录',
      fhc_cancel: '取消',
      fhc_delete: '🗑 删除'
    }
  };

  const UNIT_OPTIONS = [
    ['— Select unit / 选择单位 —', '— 选择单位 —'],
    ['#06-27/15/16/17 (Main CK Area) / 主厨房区', '#06-27/15/16/17（主厨房区）'],
    ['#06-24 (Raw Prep) / 生食准备区', '#06-24（生食准备区）'],
    ['#06-19 (Bakery) / 烘焙区', '#06-19（烘焙区）'],
    ['#06-08 (Dishwashing) / 洗碗区', '#06-08（洗碗区）'],
    ['#05-26', '#05-26'],
    ['#05-27 (Tay Sauce Kitchen) / 泰酱厨房', '#05-27（泰酱厨房）'],
    ['#04-08 (Confinement) / 坐月子区', '#04-08（坐月子区）']
  ];

  const ZONE_OPTIONS = [
    ['— Select zone / 选择区域 —', '— 选择区域 —'],
    ['Combi Oven Area / 组合烤笩区', '组合烤箱区'],
    ['Deep Frying Area / 油炸区', '油炸区'],
    ['Stir Frying Area / 炒菜区', '炒菜区'],
    ['Packing Area / 包装区', '包装区'],
    ['Salad Room / 沙拉间', '沙拉间'],
    ['Fruit Room / 水果间', '水果间'],
    ['Cold Room / 冷藏室', '冷藏室'],
    ['Pan Fry Area / 煎锅区', '煎锅区'],
    ['Braising Area / 嬤煮区', '焖煮区'],
    ['Big Store / 大仓库', '大仓库'],
    ['Small Store / 小仓库', '小仓库'],
    ['Old Sauce Area / 老酱区', '老酱区'],
    ['Office/Changing Room Area / 办公/更衣区', '办公室 / 更衣区'],
    ['Vegetable Prep Room / 蔬菜准备间', '蔬菜准备间']
  ];

  function relabelOptions(selector, labels) {
    const options = document.querySelectorAll(selector + ' option');
    options.forEach((opt, index) => {
      if (labels[index]) opt.textContent = currentLang === 'zh' ? labels[index][1] : labels[index][0];
    });
  }

  function detectLang() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh') return stored;
    return /^zh/i.test(navigator.language || '') ? 'zh' : 'en';
  }

  let currentLang = detectLang();

  function t(key, fallback) {
    return (DICT[currentLang] && DICT[currentLang][key]) || fallback || key;
  }

  function setNodeText(selector, text) {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  }

  function setNodeHtml(selector, html) {
    const el = document.querySelector(selector);
    if (el) el.innerHTML = html;
  }

  function setPlaceholder(selector, text) {
    const el = document.querySelector(selector);
    if (el) el.placeholder = text;
  }

  function normalizePath() {
    const path = window.location.pathname;
    if (/^\/foodsafety\/fhc\/[a-f0-9]{24}$/i.test(path)) return '/foodsafety/fhc/:id';
    return path.replace(/\/$/, '') || '/';
  }

  function applyStaticTranslations() {
    const path = normalizePath();

    if (path === '/foodsafety' || path === '/foodsafety/index.html') {
      document.title = currentLang === 'zh' ? '食品安全 - Central Kitchen' : 'Food Safety - Central Kitchen';
      setNodeText('.module-card.nc h2', t('foodsafety_home_nc_title'));
      setNodeText('.module-card.nc p', t('foodsafety_home_nc_body'));
      setNodeText('.module-card.nc .card-go', t('foodsafety_home_nc_go'));
      setNodeText('.module-card.checklist h2', t('foodsafety_home_checklists_title'));
      setNodeText('.module-card.checklist p', t('foodsafety_home_checklists_body'));
      setNodeText('.module-card.checklist .card-go', t('foodsafety_home_checklists_go'));
      setNodeText('.module-card.pest h2', t('foodsafety_home_pest_title'));
      setNodeText('.module-card.pest p', t('foodsafety_home_pest_body'));
      setNodeText('.module-card.pest .card-go', t('foodsafety_home_pest_go'));
      setNodeText('.module-card.cert h2', t('foodsafety_home_fhc_title'));
      setNodeText('.module-card.cert p', t('foodsafety_home_fhc_body'));
      setNodeText('.module-card.cert .card-go', t('foodsafety_home_fhc_go'));
    }

    if (path === '/foodsafety/checklists') {
      document.title = currentLang === 'zh' ? '每月食品安全检查表' : 'Monthly Food Safety Checklists';
      setNodeText('.hero-card h1', t('checklist_hero_title'));
      setNodeText('.hero-card p', t('checklist_hero_body'));
      document.querySelectorAll('.summary-tile .lbl')[0] && (document.querySelectorAll('.summary-tile .lbl')[0].textContent = t('checklist_progress'));
      document.querySelectorAll('.summary-tile .lbl')[1] && (document.querySelectorAll('.summary-tile .lbl')[1].textContent = t('checklist_checked_cells'));
      document.querySelectorAll('.summary-tile .lbl')[2] && (document.querySelectorAll('.summary-tile .lbl')[2].textContent = t('checklist_status'));
      document.querySelectorAll('.summary-tile .lbl')[3] && (document.querySelectorAll('.summary-tile .lbl')[3].textContent = t('checklist_weeks'));
      document.querySelector('label[for="monthInput"]') && (document.querySelector('label[for="monthInput"]').textContent = t('checklist_month'));
      document.querySelector('label[for="unitSelect"]') && (document.querySelector('label[for="unitSelect"]').textContent = t('checklist_unit'));
      setNodeText('.form-group label:not([for])', t('checklist_template'));
      setNodeText('#reloadBtn', t('checklist_reload'));
      setNodeText('#reopenBtn', t('checklist_reopen'));
      setNodeText('#saveBtn', t('checklist_save'));
      setNodeText('#saveBtnSticky', t('checklist_save'));
      setNodeText('#finalizeBtn', t('checklist_finalize'));
      setNodeText('#finalizeBtnSticky', t('checklist_finalize'));
      setNodeText('.scroll-hint', t('checklist_date_hint'));
      document.querySelector('label[for="sectionRemarks"]') && (document.querySelector('label[for="sectionRemarks"]').textContent = t('checklist_remarks'));
      setPlaceholder('#sectionRemarks', t('checklist_remarks_placeholder'));
    }

    if (path === '/foodsafety/nc') {
      document.title = currentLang === 'zh' ? '不符合项报告' : 'NC Reports — Food Safety';
      setNodeText('.page-header h1', '📋 ' + t('nc_hub_title'));
      setNodeText('.page-header p', t('nc_hub_body'));
      setNodeText('.module-card.report h2', t('nc_hub_log_title'));
      setNodeText('.module-card.report p', t('nc_hub_log_body'));
      setNodeText('.module-card.report .card-go', t('nc_hub_log_go'));
      setNodeText('.module-card.view h2', t('nc_hub_view_title'));
      setNodeText('.module-card.view p', t('nc_hub_view_body'));
      setNodeText('.module-card.view .card-go', t('nc_hub_view_go'));
    }

    if (path === '/foodsafety/report-nc.html') {
      document.title = currentLang === 'zh' ? '新增不符合项' : 'Log NC - Central Kitchen';
      setNodeText('.form-header h2', t('nc_form_title'));
      setNodeText('.form-header p', t('nc_form_body'));
      document.querySelector('label[for="unit"]') && (document.querySelector('label[for="unit"]').childNodes[0].textContent = t('nc_form_unit') + ' ');
      document.querySelector('label[for="subArea"]') && (document.querySelector('label[for="subArea"]').childNodes[0].textContent = t('nc_form_zone') + ' ');
      setNodeText('label[for="specificLocation"]', t('nc_form_specific'));
      document.querySelector('label[for="description"]') && (document.querySelector('label[for="description"]').childNodes[0].textContent = t('nc_form_description') + ' ');
      setNodeText('.form-group label[for="reportedBy"]', t('nc_form_name') + ' ');
      setNodeText('.form-group label[for="unit"] + select + *', '');
      setNodeText('#photoLabelText', currentLang === 'zh' ? '附上问题照片' : 'Attach a photo of the issue');
      setNodeText('.form-actions .btn-secondary', t('nc_form_cancel'));
      setNodeText('.form-actions .btn-primary', t('nc_form_submit'));
      relabelOptions('#unit', UNIT_OPTIONS);
      relabelOptions('#subArea', ZONE_OPTIONS);
    }

    if (path === '/foodsafety/nc-list.html') {
      document.title = currentLang === 'zh' ? '不符合项列表' : 'Food Safety NCs - Central Kitchen';
      setNodeText('.list-header h2', t('nc_list_title'));
      setNodeText('.list-header .btn-primary', t('nc_list_log'));
      setNodeText('label[for="filterUnit"]', t('nc_list_filter_unit'));
      setNodeText('label[for="filterStatus"]', t('nc_list_filter_status'));
      document.querySelector('#filterUnit option[value=""]') && (document.querySelector('#filterUnit option[value=""]').textContent = currentLang === 'zh' ? '所有单位' : 'All Units');
      const statusOptions = document.querySelectorAll('#filterStatus option');
      statusOptions[0] && (statusOptions[0].textContent = currentLang === 'zh' ? '所有状态' : 'All Statuses');
      statusOptions[1] && (statusOptions[1].textContent = t('status_open'));
      statusOptions[2] && (statusOptions[2].textContent = t('status_resolved'));
    }

    if (path === '/foodsafety/nc-detail.html') {
      document.title = currentLang === 'zh' ? '不符合项详情' : 'NC Detail - Central Kitchen';
      setNodeText('.resolution-section h3', t('nc_detail_resolution_title'));
      setNodeText('label[for="resolver"]', t('nc_detail_resolved_by') + ' ');
      document.querySelector('#resolutionSection .form-group label:not([for])') && (document.querySelector('#resolutionSection .form-group label:not([for])').childNodes[0].textContent = t('nc_detail_resolution_photo') + ' ');
      setNodeText('#resPhotoLabelText', currentLang === 'zh' ? '附上解决照片' : 'Attach a resolution photo');
      document.querySelector('label[for="resolutionNotes"]') && (document.querySelector('label[for="resolutionNotes"]').childNodes[0].textContent = t('nc_detail_resolution_notes') + ' ');
      document.querySelectorAll('a[href="nc-list.html"]').forEach((el) => { el.textContent = t('nc_detail_back_list'); });
      document.querySelectorAll('button[onclick="deleteCurrentNC()"]').forEach((el) => { el.textContent = t('nc_detail_delete_report'); });
      document.querySelector('#resolutionForm .btn-primary') && (document.querySelector('#resolutionForm .btn-primary').textContent = t('nc_detail_mark_resolved'));
    }

    if (path === '/foodsafety/fhc') {
      document.title = currentLang === 'zh' ? '员工证书与执照追踪' : 'Employee Certification & Licence Tracker — Food Safety';
      setNodeText('main h1', t('fhc_list_title'));
      setNodeText('a[href="/foodsafety/fhc/new"]', t('fhc_add_record'));
      document.querySelector('button[onclick="openCsvModal()"]') && (document.querySelector('button[onclick="openCsvModal()"]').textContent = t('fhc_import_csv'));
      document.querySelector('button[onclick="printPDF()"]') && (document.querySelector('button[onclick="printPDF()"]').textContent = t('fhc_print_pdf'));
      setNodeText('a[href="/foodsafety/"]', t('fhc_back'));
      const stats = document.querySelectorAll('.stat-card .lbl');
      stats[0] && (stats[0].textContent = t('fhc_total'));
      stats[1] && (stats[1].textContent = t('fhc_valid'));
      stats[2] && (stats[2].textContent = t('fhc_expiring'));
      stats[3] && (stats[3].textContent = t('fhc_invalid'));
      setPlaceholder('#search', t('fhc_search_placeholder'));
      document.querySelector('#filterEntity option[value=""]') && (document.querySelector('#filterEntity option[value=""]').textContent = t('fhc_all_entities'));
      const validityOptions = document.querySelectorAll('#filterValidity option');
      validityOptions[0] && (validityOptions[0].textContent = t('fhc_all_validity'));
      validityOptions[1] && (validityOptions[1].textContent = t('fhc_validity_valid'));
      validityOptions[2] && (validityOptions[2].textContent = t('fhc_validity_expiring'));
      validityOptions[3] && (validityOptions[3].textContent = t('fhc_validity_invalid'));
    }

    if (path === '/foodsafety/fhc/new' || path === '/foodsafety/fhc/:id') {
      document.title = currentLang === 'zh' ? '证书记录' : 'Employee Cert & Licence — Food Safety';
      if (!document.body.dataset.editingTitleLocked) setNodeText('#page-title', t('fhc_form_add'));
      setNodeText('.page-header .btn', t('fhc_form_back'));
      setNodeText('label[for="businessEntity"]', t('fhc_business_entity'));
      setNodeText('label[for="employeeName"]', t('fhc_employee_name'));
      setNodeText('label[for="previousCertDate"]', t('fhc_prev_cert_date'));
      setNodeText('label[for="startDate"]', t('fhc_start_date'));
      const expiryLabel = document.querySelector('label[for="expiryDate"]');
      if (expiryLabel) expiryLabel.childNodes[0].textContent = t('fhc_expiry_date') + ' ';
      setNodeText('label[for="isRefresher"]', t('fhc_refresher'));
      setNodeText('label[for="isCancelled"]', t('fhc_cancelled'));
      setNodeText('label[for="cancellationReason"]', t('fhc_cancel_reason'));
      setNodeText('label[for="remarks"]', t('fhc_remarks'));
      setNodeText('#submit-btn', t('fhc_save_record'));
      document.querySelector('.form-footer .btn.btn-outline') && (document.querySelector('.form-footer .btn.btn-outline').textContent = t('fhc_cancel'));
      setNodeText('#delete-btn', t('fhc_delete'));
    }
  }

  function renderToggle() {
    let holder = document.getElementById('foodsafety-lang-toggle');
    if (!holder) {
      holder = document.createElement('div');
      holder.id = 'foodsafety-lang-toggle';
      holder.style.position = 'fixed';
      holder.style.top = '72px';
      holder.style.right = '14px';
      holder.style.zIndex = '650';
      holder.style.display = 'flex';
      holder.style.gap = '4px';
      holder.style.background = 'rgba(255,255,255,0.95)';
      holder.style.border = '1px solid rgba(18,19,22,0.1)';
      holder.style.borderRadius = '999px';
      holder.style.padding = '4px';
      holder.style.boxShadow = '0 6px 18px rgba(18,19,22,0.12)';
      holder.innerHTML = '<button type="button" data-lang="en"></button><button type="button" data-lang="zh"></button>';
      document.body.appendChild(holder);
      holder.querySelectorAll('button').forEach((btn) => {
        btn.style.border = 'none';
        btn.style.borderRadius = '999px';
        btn.style.padding = '7px 10px';
        btn.style.fontFamily = 'inherit';
        btn.style.fontWeight = '700';
        btn.style.fontSize = '0.8rem';
        btn.style.cursor = 'pointer';
        btn.style.background = 'transparent';
        btn.addEventListener('click', () => setLang(btn.dataset.lang));
      });
    }

    holder.setAttribute('aria-label', t('lang_toggle_label'));
    holder.querySelector('[data-lang="en"]').textContent = t('toggle_en');
    holder.querySelector('[data-lang="zh"]').textContent = t('toggle_zh');
    holder.querySelectorAll('button').forEach((btn) => {
      const active = btn.dataset.lang === currentLang;
      btn.style.background = active ? '#16a085' : 'transparent';
      btn.style.color = active ? '#fff' : '#5a616c';
    });
  }

  function notify() {
    listeners.forEach((fn) => {
      try { fn(currentLang); } catch (_) {}
    });
    window.dispatchEvent(new CustomEvent('foodsafety-languagechange', { detail: { lang: currentLang } }));
  }

  function setLang(lang) {
    currentLang = lang === 'zh' ? 'zh' : 'en';
    localStorage.setItem(STORAGE_KEY, currentLang);
    renderToggle();
    applyStaticTranslations();
    notify();
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  window.FoodSafetyI18n = {
    getLang: () => currentLang,
    setLang,
    t,
    onChange,
    render: applyStaticTranslations
  };

  document.addEventListener('DOMContentLoaded', () => {
    renderToggle();
    applyStaticTranslations();
  });
}());
