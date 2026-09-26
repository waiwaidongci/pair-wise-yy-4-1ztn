// 复测档案：标记、待确认复测记录与历史旧值的存储和业务规则
window.Archive = (() => {
  const MARKS_KEY = "zfl30Marks";
  const PENDING_KEY = "zfl30Pending";
  const DEPTH_JUMP_LIMIT = 0.2; // 深度变化超过原值两成需要提示
  // 复测确认时被替换/留存的字段
  const FIX_FIELDS = ["code", "type", "dive", "x", "y", "depth", "depthM", "orientation", "condition", "note", "source", "calibrated"];
  const collator = new Intl.Collator("zh-Hans", { numeric: true });

  let marks = load(MARKS_KEY).map(normalize);
  let pending = load(PENDING_KEY);

  if (localStorage.getItem(MARKS_KEY) === null && !marks.length) seed();

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch { return []; }
  }

  function persist() {
    localStorage.setItem(MARKS_KEY, JSON.stringify(marks));
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  }

  // 兼容旧数据：补齐定位来源、校准状态和历史字段
  function normalize(mark) {
    const m = { orientation: "", condition: "", note: "", source: "未记录", calibrated: true, history: [], ...mark };
    m.depthM = Coords.parseDepth(m.depth);
    return m;
  }

  function seed() {
    const now = new Date().toISOString();
    marks = [
      { code: "A-017", type: "ceramic", dive: "DIVE-01", x: 42, y: 46, depth: "17.8m", orientation: "东", condition: "边缘残缺", note: "靠近船肋", source: "USBL超短基线", calibrated: true },
      { code: "W-003", type: "wood", dive: "DIVE-02", x: 58, y: 39, depth: "18.2m", orientation: "西北", condition: "稳定", note: "疑似横梁", source: "GPS浮标", calibrated: true }
    ].map(m => normalize({ ...m, id: crypto.randomUUID(), loggedAt: now }));
    persist();
  }

  function allMarks() { return marks; }
  function findMark(id) { return marks.find(m => m.id === id); }
  function findByCode(code) { return marks.find(m => m.code === code); }

  // 点位与深度是否未变（未变才算资料性修改，可直接更新）
  function sameFix(a, b) {
    if (Number(a.x) !== Number(b.x) || Number(a.y) !== Number(b.y)) return false;
    const da = Coords.parseDepth(a.depth);
    const db = Coords.parseDepth(b.depth);
    if (da != null && db != null) return da === db;
    return String(a.depth || "") === String(b.depth || "");
  }

  // 评估复测记录相对原标记的风险：深度变化超两成、定位来源未校准、位移
  function evaluate(base, next) {
    const ratio = base ? Coords.depthChangeRatio(base.depth, next.depth) : null;
    return {
      depthRatio: ratio,
      depthJump: ratio != null && Math.abs(ratio) > DEPTH_JUMP_LIMIT,
      uncalibrated: !next.calibrated,
      shift: base ? Coords.distance(base, next) : null
    };
  }

  // 保存入口：
  // 1. 选中标记且编号、点位、深度均未变 -> 直接更新资料
  // 2. 编号已存在（含改动了点位/深度、或编号串到别的标记）-> 进待确认区
  // 3. 编号未被占用 -> 直接更新（改名）或新建标记
  function submit(data) {
    const now = new Date().toISOString();
    const current = data.id ? findMark(data.id) : null;
    const base = findByCode(data.code);
    if (current && base && current.id === base.id && sameFix(current, data)) {
      Object.assign(current, data, { id: current.id, history: current.history, loggedAt: now });
      persist();
      return { status: "updated", mark: current };
    }
    if (base) {
      const record = normalize({ ...data, id: crypto.randomUUID(), baseId: base.id, createdAt: now, loggedAt: now });
      pending.push(record);
      persist();
      return { status: "pending", record, base };
    }
    if (current) {
      Object.assign(current, data, { id: current.id, history: current.history, loggedAt: now });
      persist();
      return { status: "updated", mark: current };
    }
    const mark = normalize({ ...data, id: crypto.randomUUID(), loggedAt: now });
    marks.push(mark);
    persist();
    return { status: "created", mark };
  }

  function removeMark(id) {
    marks = marks.filter(m => m.id !== id);
    persist();
  }

  // 确认：新值替换原标记，旧值完整留存在 history
  function confirmPending(recordId) {
    const rec = pending.find(r => r.id === recordId);
    if (!rec) return null;
    const base = findMark(rec.baseId) || findByCode(rec.code);
    let result;
    if (base) {
      const snapshot = { replacedAt: new Date().toISOString(), replacedByDive: rec.dive };
      FIX_FIELDS.forEach(k => { snapshot[k] = base[k]; });
      base.history = base.history || [];
      base.history.push(snapshot);
      FIX_FIELDS.forEach(k => { if (k in rec) base[k] = rec[k]; });
      base.depthM = Coords.parseDepth(base.depth);
      base.loggedAt = new Date().toISOString();
      result = base;
    } else {
      // 原标记已删除：以复测记录重新建档
      const mark = normalize({ ...rec, id: crypto.randomUUID() });
      delete mark.baseId;
      delete mark.createdAt;
      marks.push(mark);
      result = mark;
    }
    pending = pending.filter(r => r.id !== recordId);
    persist();
    return result;
  }

  // 驳回：丢弃复测记录，原标记继续有效
  function rejectPending(recordId) {
    pending = pending.filter(r => r.id !== recordId);
    persist();
  }

  // 待确认记录：可按潜次过滤，始终按编号排序，便于潜次结束后逐条处理
  function pendingRecords(dive) {
    return pending
      .filter(r => !dive || r.dive === dive)
      .slice()
      .sort((a, b) => collator.compare(a.code, b.code));
  }

  function pendingDives() {
    return [...new Set(pending.map(r => r.dive))].sort(collator.compare);
  }

  function exportPayload() {
    return { exportedAt: new Date().toISOString(), marks, pending };
  }

  return {
    allMarks, findMark, findByCode, evaluate, submit, removeMark,
    confirmPending, rejectPending, pendingRecords, pendingDives, exportPayload
  };
})();
