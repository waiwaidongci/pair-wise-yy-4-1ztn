// 复测档案：标记、待确认记录与替换历史的存储和业务规则
window.Archive = (() => {
  const KEYS = {
    marks: "zfl30Marks",
    pending: "zfl30Pending",
    history: "zfl30History",
    endedDives: "zfl30EndedDives"
  };
  const SOURCES = ["GPS浮标", "USBL水声", "ROV航位推算", "人工估计"];

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }
  function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  // 旧数据兼容：深度统一为数值（米），补定位来源字段
  function normalizeMark(mark) {
    return {
      source: "人工估计",
      calibrated: false,
      orientation: "",
      condition: "",
      note: "",
      ...mark,
      depth: Coords.parseDepth(mark.depth)
    };
  }

  let marks = read(KEYS.marks, []).map(normalizeMark);
  let pending = read(KEYS.pending, []);
  let history = read(KEYS.history, []);
  let endedDives = read(KEYS.endedDives, {});

  if (!marks.length && !localStorage.getItem(KEYS.marks)) {
    marks = [
      normalizeMark({ id: crypto.randomUUID(), code: "A-017", type: "ceramic", dive: "DIVE-01", x: 42, y: 46, depth: 17.8, orientation: "东", condition: "边缘残缺", note: "靠近船肋", source: "USBL水声", calibrated: true }),
      normalizeMark({ id: crypto.randomUUID(), code: "W-003", type: "wood", dive: "DIVE-02", x: 58, y: 39, depth: 18.2, orientation: "西北", condition: "稳定", note: "疑似横梁", source: "GPS浮标", calibrated: true })
    ];
    write(KEYS.marks, marks);
  }

  const byCode = code => marks.find(m => m.code.toLowerCase() === String(code || "").trim().toLowerCase());
  const byId = id => marks.find(m => m.id === id);

  // 保存复测记录：记下潜次与定位来源；同编号的新坐标先留在待确认区
  function saveSurvey(input) {
    const record = {
      code: String(input.code || "").trim(),
      type: input.type || "unknown",
      dive: input.dive || "",
      depth: Coords.parseDepth(input.depth),
      x: input.x,
      y: input.y,
      source: input.source || "人工估计",
      calibrated: !!input.calibrated,
      orientation: input.orientation || "",
      condition: input.condition || "",
      note: input.note || "",
      savedAt: new Date().toISOString()
    };
    const existing = byCode(record.code) || (input.id ? byId(input.id) : null);
    if (existing) {
      const flags = [];
      if (Coords.depthChangeRatio(existing.depth, record.depth) > Coords.DEPTH_JUMP_LIMIT) flags.push("depthJump");
      if (!record.calibrated) flags.push("uncalibrated");
      pending.push({ ...record, id: crypto.randomUUID(), targetId: existing.id, flags, status: "pending" });
      write(KEYS.pending, pending);
      return { kind: "pending", flags, target: existing };
    }
    const mark = { ...record, id: crypto.randomUUID() };
    marks.push(mark);
    write(KEYS.marks, marks);
    return { kind: "created", mark };
  }

  // 确认待确认记录：替换原标记，旧值存入复测档案
  function confirmPending(id) {
    const index = pending.findIndex(p => p.id === id);
    if (index < 0) return null;
    const [record] = pending.splice(index, 1);
    const { id: _pendingId, targetId, flags, status, ...values } = record;
    const target = byId(targetId);
    if (target) {
      const previous = { ...target };
      Object.assign(target, values, { confirmedAt: new Date().toISOString() });
      history.push({ code: target.code, dive: record.dive, replacedAt: new Date().toISOString(), previous, next: { ...target } });
      write(KEYS.history, history);
    } else {
      // 原标记已不存在，作为新标记落档
      marks.push({ ...values, id: crypto.randomUUID() });
    }
    write(KEYS.marks, marks);
    write(KEYS.pending, pending);
    return record;
  }

  // 驳回待确认记录：原标记继续有效
  function rejectPending(id) {
    const record = pending.find(p => p.id === id);
    pending = pending.filter(p => p.id !== id);
    write(KEYS.pending, pending);
    return record;
  }

  function removeMark(id) {
    marks = marks.filter(m => m.id !== id);
    pending = pending.filter(p => p.targetId !== id);
    write(KEYS.marks, marks);
    write(KEYS.pending, pending);
  }

  // 结束潜次：返回该潜次按编号排序的待确认记录
  function endDive(dive) {
    endedDives[dive] = new Date().toISOString();
    write(KEYS.endedDives, endedDives);
    return pendingByCode(dive);
  }

  // 待确认记录按编号排序，可按潜次过滤
  function pendingByCode(dive) {
    return pending
      .filter(p => !dive || p.dive === dive)
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code, "zh-Hans-CN", { numeric: true }) || a.savedAt.localeCompare(b.savedAt));
  }

  const hasPending = markId => pending.some(p => p.targetId === markId);
  const isEnded = dive => !!endedDives[dive];
  const dives = () => [...new Set([...marks.map(m => m.dive), ...pending.map(p => p.dive)])]
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true }));

  function exportData() {
    const withGeo = record => ({ ...record, geo: Coords.toGeo(record.x, record.y), grid: Coords.gridRef(record.x, record.y) });
    return {
      exportedAt: new Date().toISOString(),
      site: Coords.SITE,
      marks: marks.map(withGeo),
      pending: pending.map(withGeo),
      history,
      endedDives
    };
  }

  return {
    SOURCES,
    list: () => marks,
    pendingList: () => pending,
    historyList: () => history,
    findByCode: byCode,
    findById: byId,
    saveSurvey,
    confirmPending,
    rejectPending,
    removeMark,
    endDive,
    pendingByCode,
    hasPending,
    isEnded,
    dives,
    exportData
  };
})();
