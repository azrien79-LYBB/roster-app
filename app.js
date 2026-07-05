var STAFF = ["Eswari", "Azrin"];
var SHIFT_CODES = ["M", "A", "F", "AL", "WO", "MC", "EL", "RL"];
var UNAVAILABLE = new Set(["AL", "WO", "MC", "EL", "RL"]);
var WORKING = new Set(["M", "A", "F"]);
var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var JULY_2026_SOURCE = {
  Eswari: ["M", "F", "F", "AL", "AL", "WO", "M", "A", "A", "F", "M", "A", "WO", "M", "M", "M", "F", "M", "A", "WO", "A", "A", "A", "F", "M", "A", "M", "A", "WO", "M", "F"],
  Azrin: ["A", "AL", "WO", "F", "F", "F", "A", "M", "M", "WO", "A", "M", "F", "A", "A", "A", "WO", "A", "M", "F", "M", "M", "M", "WO", "A", "M", "A", "M", "F", "A", "WO"]
};
var els = {
  pageTitle: document.getElementById("pageTitle"), monthSelect: document.getElementById("monthSelect"), yearInput: document.getElementById("yearInput"), lockToggle: document.getElementById("lockToggle"), generateBtn: document.getElementById("generateBtn"), resetBtn: document.getElementById("resetBtn"), conflictCount: document.getElementById("conflictCount"), conflictTone: document.getElementById("conflictTone"), balanceScore: document.getElementById("balanceScore"), statEswari: document.getElementById("statEswari"), statAzrin: document.getElementById("statAzrin"), periodLabel: document.getElementById("periodLabel"), rosterTable: document.getElementById("rosterTable"), leaveStaff: document.getElementById("leaveStaff"), leaveDate: document.getElementById("leaveDate"), leaveType: document.getElementById("leaveType"), leaveForm: document.getElementById("leaveForm"), clearLeaveBtn: document.getElementById("clearLeaveBtn"), leaveList: document.getElementById("leaveList"), alertsList: document.getElementById("alertsList"), editDialog: document.getElementById("editDialog"), editDateLabel: document.getElementById("editDateLabel"), editStaffLabel: document.getElementById("editStaffLabel"), shiftPicker: document.getElementById("shiftPicker"), clearCellBtn: document.getElementById("clearCellBtn"), printBtn: document.getElementById("printBtn"), excelBtn: document.getElementById("excelBtn"), emailBtn: document.getElementById("emailBtn"), toast: document.getElementById("toast")
};
var state = { year: 2026, month: 7, roster: {}, protectedCells: {}, selected: null };
function pad(value) { return String(value).padStart(2, "0"); }
function dayCount(year, month) { return new Date(year || state.year, month || state.month, 0).getDate(); }
function storageKey() { return "concierge-roster:" + state.year + "-" + pad(state.month); }
function isUnavailable(code) { return UNAVAILABLE.has(code); }
function isWorking(code) { return WORKING.has(code); }
function otherStaff(name) { return STAFF.find(function (staff) { return staff !== name; }); }
function shiftClass(code) { return "shift-" + (code || "empty").toLowerCase(); }
function formatDay(day) { return day + " " + MONTHS[state.month - 1].slice(0, 3); }
function isoDate(day) { return state.year + "-" + pad(state.month) + "-" + pad(day); }
function markProtected(day, staff, code) { state.protectedCells[day + ":" + staff] = code; }
function createBlankRoster() {
  var roster = {};
  for (var day = 1; day <= dayCount(); day += 1) {
    roster[day] = {};
    STAFF.forEach(function (staff) { roster[day][staff] = ""; });
  }
  return roster;
}
function applySourceSeed() {
  state.roster = createBlankRoster();
  state.protectedCells = {};
  if (state.year === 2026 && state.month === 7) {
    STAFF.forEach(function (staff) {
      JULY_2026_SOURCE[staff].forEach(function (code, index) {
        var day = index + 1;
        state.roster[day][staff] = code;
        if (code === "AL" || code === "WO") markProtected(day, staff, code);
      });
    });
    return;
  }
  for (var day = 1; day <= dayCount(); day += 1) {
    var weekday = new Date(state.year, state.month - 1, day).getDay();
    if (weekday === 1) { state.roster[day].Eswari = "WO"; markProtected(day, "Eswari", "WO"); }
    if (weekday === 5) { state.roster[day].Azrin = "WO"; markProtected(day, "Azrin", "WO"); }
  }
  generateSchedule({ silent: true, save: false });
}
function loadMonth() {
  var saved = localStorage.getItem(storageKey());
  if (saved) {
    try {
      var parsed = JSON.parse(saved);
      state.roster = parsed.roster || createBlankRoster();
      state.protectedCells = parsed.protectedCells || {};
      trimRosterToMonth();
      return;
    } catch (error) { localStorage.removeItem(storageKey()); }
  }
  applySourceSeed();
}
function trimRosterToMonth() {
  var fresh = createBlankRoster();
  Object.keys(fresh).forEach(function (day) {
    STAFF.forEach(function (staff) { fresh[day][staff] = state.roster && state.roster[day] ? state.roster[day][staff] || "" : ""; });
  });
  state.roster = fresh;
}
function saveMonth() { localStorage.setItem(storageKey(), JSON.stringify({ roster: state.roster, protectedCells: state.protectedCells })); }
function chooseBalancedAssignment(day, counts, lastShift) {
  var candidates = [{ Eswari: "M", Azrin: "A" }, { Eswari: "A", Azrin: "M" }];
  var winner = candidates[0];
  var bestScore = Infinity;
  candidates.forEach(function (candidate) {
    var score = 0;
    STAFF.forEach(function (staff) {
      var nextM = counts[staff].M + (candidate[staff] === "M" ? 1 : 0);
      var nextA = counts[staff].A + (candidate[staff] === "A" ? 1 : 0);
      score += Math.abs(nextM - nextA) * 4;
      if (lastShift[staff] && lastShift[staff] !== candidate[staff]) score += 0.35;
    });
    if (day % 2 === 0 && candidate.Eswari === "M") score += 0.05;
    if (score < bestScore) { winner = candidate; bestScore = score; }
  });
  return winner;
}
function generateSchedule(options) {
  options = options || {};
  var counts = {};
  var lastShift = {};
  STAFF.forEach(function (staff) { counts[staff] = { M: 0, A: 0, F: 0, AL: 0, WO: 0, MC: 0, EL: 0, RL: 0 }; lastShift[staff] = ""; });
  for (var day = 1; day <= dayCount(); day += 1) {
    STAFF.forEach(function (staff) { if (!isUnavailable(state.roster[day][staff])) state.roster[day][staff] = ""; });
    var unavailable = STAFF.filter(function (staff) { return isUnavailable(state.roster[day][staff]); });
    if (unavailable.length === 2) {
      unavailable.forEach(function (staff) { counts[staff][state.roster[day][staff]] += 1; });
      continue;
    }
    if (unavailable.length === 1) {
      var available = otherStaff(unavailable[0]);
      state.roster[day][available] = "F";
      STAFF.forEach(function (staff) { var code = state.roster[day][staff]; if (code) counts[staff][code] += 1; });
      lastShift[available] = "F";
      continue;
    }
    var assignment = chooseBalancedAssignment(day, counts, lastShift);
    STAFF.forEach(function (staff) { state.roster[day][staff] = assignment[staff]; counts[staff][assignment[staff]] += 1; lastShift[staff] = assignment[staff]; });
  }
  if (options.save !== false) saveMonth();
  if (!options.silent) { render(); showToast("Jadual dijana semula."); }
}
function autoArrangeDay(day, changedStaff, code) {
  var other = otherStaff(changedStaff);
  var changedUnavailable = isUnavailable(code);
  var otherUnavailable = isUnavailable(state.roster[day][other]);
  if (changedUnavailable && !otherUnavailable) { state.roster[day][other] = "F"; return; }
  if (!changedUnavailable && otherUnavailable) { state.roster[day][changedStaff] = "F"; return; }
  if (!changedUnavailable && !otherUnavailable) {
    if (code === "M") state.roster[day][other] = "A";
    if (code === "A") state.roster[day][other] = "M";
    if (!state.roster[day][other] && code !== "F") state.roster[day][other] = code === "M" ? "A" : "M";
    if (state.roster[day][other] === "F" && code !== "F") state.roster[day][other] = code === "M" ? "A" : "M";
  }
}
function setCell(day, staff, code, source) {
  source = source || "manual";
  var lockedCode = state.protectedCells[day + ":" + staff];
  if (els.lockToggle.checked && lockedCode && source === "manual") { showToast(staff + " " + formatDay(day) + " dikunci sebagai " + lockedCode + "."); return false; }
  state.roster[day][staff] = code;
  if ((code === "AL" || code === "WO") && source === "leave") markProtected(day, staff, code);
  if (code !== "AL" && code !== "WO" && !lockedCode) delete state.protectedCells[day + ":" + staff];
  autoArrangeDay(day, staff, code);
  saveMonth();
  render();
  return true;
}
function computeStats() {
  var stats = {};
  STAFF.forEach(function (staff) { stats[staff] = { M: 0, A: 0, F: 0, AL: 0, WO: 0, MC: 0, EL: 0, RL: 0, Work: 0 }; });
  for (var day = 1; day <= dayCount(); day += 1) {
    STAFF.forEach(function (staff) { var code = state.roster[day][staff]; if (stats[staff][code] !== undefined) stats[staff][code] += 1; if (isWorking(code)) stats[staff].Work += 1; });
  }
  return stats;
}
function findConflicts() {
  var conflicts = [];
  for (var day = 1; day <= dayCount(); day += 1) {
    var values = STAFF.map(function (staff) { return { staff: staff, code: state.roster[day][staff] }; });
    var unavailable = values.filter(function (item) { return isUnavailable(item.code); });
    var working = values.filter(function (item) { return isWorking(item.code); });
    var full = values.filter(function (item) { return item.code === "F"; });
    if (unavailable.length === 2) { conflicts.push({ level: "red", title: formatDay(day) + ": dua-dua cuti/off", detail: values.map(function (item) { return item.staff + " " + item.code; }).join(", ") }); continue; }
    if (working.length === 0) conflicts.push({ level: "red", title: formatDay(day) + ": tiada orang bertugas", detail: values.map(function (item) { return item.staff + " " + (item.code || "-"); }).join(", ") });
    if (full.length === 2) conflicts.push({ level: "red", title: formatDay(day) + ": dua Full Shift serentak", detail: "Hanya satu F diperlukan untuk perlindungan penuh." });
    if (unavailable.length === 1) {
      var available = values.find(function (item) { return !isUnavailable(item.code); });
      if (available && available.code !== "F") conflicts.push({ level: "red", title: formatDay(day) + ": " + available.staff + " perlu F", detail: unavailable[0].staff + " " + unavailable[0].code + "." });
    }
    if (unavailable.length === 0 && full.length === 1) conflicts.push({ level: "amber", title: formatDay(day) + ": F tanpa cuti/off sebelah", detail: "Semak jika Full Shift masih diperlukan." });
    if (values.every(function (item) { return item.code === "M"; }) || values.every(function (item) { return item.code === "A"; })) conflicts.push({ level: "amber", title: formatDay(day) + ": shift sama untuk dua staf", detail: "M dan A biasanya perlu seimbang pada hari biasa." });
    values.forEach(function (item) {
      var lockedCode = state.protectedCells[day + ":" + item.staff];
      if (lockedCode && item.code !== lockedCode) conflicts.push({ level: "red", title: formatDay(day) + ": " + item.staff + " AL/WO berubah", detail: "Asal " + lockedCode + ", kini " + (item.code || "kosong") + "." });
    });
  }
  return conflicts;
}
function renderStats(stats) {
  STAFF.forEach(function (staff) {
    var container = staff === "Eswari" ? els.statEswari : els.statAzrin;
    var pills = ["M", "A", "F", "AL", "WO"].map(function (code) { return '<span class="stat-pill ' + shiftClass(code) + '">' + stats[staff][code] + '<span>' + code + '</span></span>'; }).join("");
    container.innerHTML = '<span class="metric-label">' + staff + '</span><strong>' + stats[staff].Work + '</strong><small>Jumlah hari kerja</small><div class="staff-stats">' + pills + '</div>';
  });
}
function renderRosterTable() {
  var headCells = '<th>Staff</th>';
  for (var day = 1; day <= dayCount(); day += 1) {
    var weekday = WEEKDAYS[new Date(state.year, state.month - 1, day).getDay()];
    headCells += '<th><span class="day-label"><span>' + day + '</span><span class="weekday">' + weekday + '</span></span></th>';
  }
  var bodyRows = STAFF.map(function (staff) {
    var cells = '<td class="staff-name">' + staff + '</td>';
    for (var day = 1; day <= dayCount(); day += 1) {
      var code = state.roster[day][staff] || "";
      var locked = state.protectedCells[day + ":" + staff];
      cells += '<td><button class="cell-button ' + shiftClass(code) + '" data-day="' + day + '" data-staff="' + staff + '" type="button" aria-label="' + staff + ' ' + formatDay(day) + ' ' + (code || "kosong") + '">' + (code || "-") + (locked ? '<span class="locked-mark">LOCK</span>' : "") + '</button></td>';
    }
    return '<tr>' + cells + '</tr>';
  }).join("");
  els.rosterTable.innerHTML = '<thead><tr>' + headCells + '</tr></thead><tbody>' + bodyRows + '</tbody>';
}
function renderAlerts(conflicts) {
  var redCount = conflicts.filter(function (item) { return item.level === "red"; }).length;
  els.conflictCount.textContent = String(redCount);
  if (!conflicts.length) { els.conflictTone.textContent = "Roster bersih"; els.alertsList.innerHTML = '<div class="empty-state">Tiada konflik dikesan.</div>'; return; }
  els.conflictTone.textContent = redCount ? "Perlu semakan" : "Ada amaran ringan";
  els.alertsList.innerHTML = conflicts.map(function (item) { return '<div class="alert-row ' + item.level + '"><strong>' + item.title + '</strong><span>' + item.detail + '</span></div>'; }).join("");
}
function renderLeaveList() {
  var rows = [];
  for (var day = 1; day <= dayCount(); day += 1) STAFF.forEach(function (staff) { var code = state.roster[day][staff]; if (isUnavailable(code)) rows.push({ day: day, staff: staff, code: code }); });
  if (!rows.length) { els.leaveList.innerHTML = '<div class="empty-state">Tiada cuti/off direkodkan.</div>'; return; }
  els.leaveList.innerHTML = rows.map(function (row) { return '<button class="leave-row" type="button" data-day="' + row.day + '" data-staff="' + row.staff + '"><strong>' + formatDay(row.day) + ' - ' + row.staff + '</strong><span>' + row.code + '</span></button>'; }).join("");
}
function setDateBounds() {
  var min = state.year + "-" + pad(state.month) + "-01";
  var max = state.year + "-" + pad(state.month) + "-" + pad(dayCount());
  els.leaveDate.min = min; els.leaveDate.max = max;
  if (!els.leaveDate.value || els.leaveDate.value < min || els.leaveDate.value > max) els.leaveDate.value = min;
}
function render() {
  var label = MONTHS[state.month - 1] + " " + state.year;
  els.pageTitle.textContent = "Roster " + label;
  els.periodLabel.textContent = label;
  els.yearInput.value = state.year;
  els.monthSelect.value = String(state.month);
  setDateBounds();
  var stats = computeStats();
  var conflicts = findConflicts();
  renderStats(stats);
  els.balanceScore.textContent = String(STAFF.reduce(function (total, staff) { return total + Math.abs(stats[staff].M - stats[staff].A); }, 0));
  renderRosterTable();
  renderLeaveList();
  renderAlerts(conflicts);
}
function openEditor(day, staff) {
  state.selected = { day: day, staff: staff };
  els.editDateLabel.textContent = formatDay(day);
  els.editStaffLabel.textContent = staff;
  var current = state.roster[day][staff] || "";
  els.shiftPicker.innerHTML = SHIFT_CODES.map(function (code) { return '<button class="shift-option ' + shiftClass(code) + '" data-code="' + code + '" type="button" aria-pressed="' + (current === code) + '">' + code + '</button>'; }).join("");
  if (typeof els.editDialog.showModal === "function") els.editDialog.showModal();
}
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(function () { els.toast.classList.remove("show"); }, 2400);
}
function exportExcel() {
  var rows = [];
  var header = ["Staff"];
  for (var day = 1; day <= dayCount(); day += 1) header.push(String(day));
  rows.push(header);
  STAFF.forEach(function (staff) { var row = [staff]; for (var day = 1; day <= dayCount(); day += 1) row.push(state.roster[day][staff] || ""); rows.push(row); });
  var html = '<html><head><meta charset="utf-8"></head><body><table border="1">' + rows.map(function (row) { return '<tr>' + row.map(function (cell) { return '<td>' + cell + '</td>'; }).join("") + '</tr>'; }).join("") + '</table></body></html>';
  var blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  var link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "Concierge-Roster-" + MONTHS[state.month - 1] + "-" + state.year + ".xls";
  link.click();
  URL.revokeObjectURL(link.href);
}
function emailHr() {
  var stats = computeStats();
  var redCount = findConflicts().filter(function (item) { return item.level === "red"; }).length;
  var lines = ["Concierge Duty Roster " + MONTHS[state.month - 1] + " " + state.year, ""];
  STAFF.forEach(function (staff) { lines.push(staff + ": M " + stats[staff].M + ", A " + stats[staff].A + ", F " + stats[staff].F + ", AL " + stats[staff].AL + ", WO " + stats[staff].WO); });
  lines.push("", "Konflik merah: " + redCount);
  window.location.href = "mailto:?subject=" + encodeURIComponent("Concierge Duty Roster " + MONTHS[state.month - 1] + " " + state.year) + "&body=" + encodeURIComponent(lines.join("\n"));
}
function resetMonth() { localStorage.removeItem(storageKey()); loadMonth(); saveMonth(); render(); showToast("Bulan ini dipulihkan kepada jadual asal."); }
function initControls() {
  els.monthSelect.innerHTML = MONTHS.map(function (month, index) { return '<option value="' + (index + 1) + '">' + month + '</option>'; }).join("");
  els.leaveStaff.innerHTML = STAFF.map(function (staff) { return '<option value="' + staff + '">' + staff + '</option>'; }).join("");
  els.monthSelect.addEventListener("change", function () { state.month = Number(els.monthSelect.value); loadMonth(); render(); });
  els.yearInput.addEventListener("change", function () { state.year = Number(els.yearInput.value); loadMonth(); render(); });
  els.generateBtn.addEventListener("click", function () { generateSchedule(); });
  els.resetBtn.addEventListener("click", resetMonth);
  els.printBtn.addEventListener("click", function () { window.print(); });
  els.excelBtn.addEventListener("click", exportExcel);
  els.emailBtn.addEventListener("click", emailHr);
  els.rosterTable.addEventListener("click", function (event) { var button = event.target.closest(".cell-button"); if (button) openEditor(Number(button.dataset.day), button.dataset.staff); });
  els.shiftPicker.addEventListener("click", function (event) { var button = event.target.closest(".shift-option"); if (!button || !state.selected) return; var didSet = setCell(state.selected.day, state.selected.staff, button.dataset.code); if (didSet) showToast(state.selected.staff + " " + formatDay(state.selected.day) + " ditukar kepada " + button.dataset.code + "."); els.editDialog.close(); });
  els.clearCellBtn.addEventListener("click", function () { if (!state.selected) return; var didSet = setCell(state.selected.day, state.selected.staff, ""); if (didSet) showToast("Sel dikosongkan."); els.editDialog.close(); });
  els.leaveForm.addEventListener("submit", function (event) { event.preventDefault(); var day = Number(els.leaveDate.value.split("-")[2]); setCell(day, els.leaveStaff.value, els.leaveType.value, "leave"); showToast(els.leaveStaff.value + " " + formatDay(day) + " disimpan sebagai " + els.leaveType.value + "."); });
  els.clearLeaveBtn.addEventListener("click", function () { var day = Number(els.leaveDate.value.split("-")[2]); setCell(day, els.leaveStaff.value, ""); });
  els.leaveList.addEventListener("click", function (event) { var row = event.target.closest(".leave-row"); if (!row) return; els.leaveStaff.value = row.dataset.staff; els.leaveDate.value = isoDate(Number(row.dataset.day)); els.leaveType.value = state.roster[Number(row.dataset.day)][row.dataset.staff] || "AL"; });
}
initControls();
loadMonth();
render();
