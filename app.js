// 页面操作：地图交互、复测台表单、筛选、列表/时间线、待确认区与导出
(() => {
  const map = document.querySelector("#map");
  const form = document.querySelector("#form");
  const list = document.querySelector("#list");
  const filter = document.querySelector("#filter");
  const view = document.querySelector("#view");
  const listTitle = document.querySelector("#listTitle");
  const codeHint = document.querySelector("#codeHint");
  const formMsg = document.querySelector("#formMsg");
  const pickedInfo = document.querySelector("#pickedInfo");
  const pendingPanel = document.querySelector("#pendingPanel");
  const pendingList = document.querySelector("#pendingList");
  const pendingDive = document.querySelector("#pendingDive");

  const typeNames = { ceramic: "陶片", wood: "木构件", metal: "金属件", unknown: "未知物" };
  let picked = null; // 地图上点选的位置（{x, y} 百分比坐标）

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  for (let i = 0; i < 7; i++) {
    const rib = document.createElement("div");
    rib.className = "rib";
    rib.style.left = 28 + i * 7 + "%";
    map.appendChild(rib);
  }

  function render() {
    const marks = Archive.allMarks();
    const filtered = filter.value ? marks.filter(m => m.type === filter.value) : marks;
    renderMap(filtered);
    if (view.value === "timeline") renderTimeline(filtered);
    else renderList(filtered);
    renderPending();
  }

  function renderMap(data) {
    map.querySelectorAll(".marker").forEach(el => el.remove());
    data.forEach(mark => {
      const el = document.createElement("button");
      el.className = "marker " + mark.type + (mark.id === form.id.value ? " selected" : "");
      el.style.left = mark.x + "%";
      el.style.top = mark.y + "%";
      el.textContent = mark.code.slice(0, 2);
      el.title = mark.code + " · " + mark.depth;
      el.onclick = event => { event.stopPropagation(); edit(mark.id); };
      map.appendChild(el);
    });
    // 待确认复测记录以虚影显示新坐标，确认前原标记继续有效
    Archive.pendingRecords().forEach(rec => {
      const el = document.createElement("button");
      el.className = "marker ghost";
      el.style.left = rec.x + "%";
      el.style.top = rec.y + "%";
      el.textContent = rec.code.slice(0, 2);
      el.title = "待确认复测：" + rec.code;
      el.onclick = event => {
        event.stopPropagation();
        pendingPanel.scrollIntoView({ behavior: "smooth" });
      };
      map.appendChild(el);
    });
  }

  function renderList(data) {
    listTitle.textContent = "标记列表";
    list.className = "list";
    list.innerHTML = data.map(m =>
      '<div class="item ' + (m.id === form.id.value ? "active" : "") + '" data-id="' + m.id + '">' +
      "<b>" + esc(m.code) + '</b> <span class="pill">' + typeNames[m.type] + "</span>" +
      (m.history && m.history.length ? '<span class="pill">留存旧值×' + m.history.length + "</span>" : "") +
      '<div class="muted">' + esc(m.dive) + " · " + esc(m.depth) + " · " + esc(m.orientation) + "</div>" +
      '<div class="muted">' + esc(m.source) + (m.calibrated ? "" : "（未校准）") + "</div>" +
      "<div>" + esc(m.condition) + "</div></div>"
    ).join("");
    list.querySelectorAll("[data-id]").forEach(el => el.onclick = () => edit(el.dataset.id));
  }

  function renderTimeline(data) {
    listTitle.textContent = "潜次时间线";
    list.className = "timeline";
    const groups = data.reduce((acc, item) => ((acc[item.dive] ||= []).push(item), acc), {});
    list.innerHTML = Object.entries(groups).map(([dive, items]) =>
      '<div class="item"><b>' + esc(dive) + '</b><div class="muted">新增' + items.length + "个标记</div>" +
      items.map(i => "<div>" + esc(i.code) + " · " + typeNames[i.type] + "</div>").join("") + "</div>"
    ).join("");
  }

  function renderPending() {
    const dives = Archive.pendingDives();
    pendingDive.innerHTML = '<option value="">全部潜次</option>' +
      dives.map(d => '<option value="' + esc(d) + '"' + (d === pendingDive.value ? " selected" : "") + ">" + esc(d) + "</option>").join("");
    const records = Archive.pendingRecords(pendingDive.value);
    if (!records.length) {
      pendingList.innerHTML = '<div class="muted">暂无待确认记录</div>';
      return;
    }
    pendingList.innerHTML = records.map(rec => {
      const base = Archive.findMark(rec.baseId) || Archive.findByCode(rec.code);
      const flags = Archive.evaluate(base, rec);
      const pct = flags.depthRatio == null ? "" : Math.round(flags.depthRatio * 100);
      const warns = (flags.depthJump ? '<span class="pill warn">深度变化超两成（' + (pct > 0 ? "+" : "") + pct + '%）</span>' : "") +
        (flags.uncalibrated ? '<span class="pill warn">定位未校准</span>' : "");
      const oldLine = base
        ? "原值：" + esc(base.depth) + " · " + Coords.formatLocal(base.x, base.y) + " · " + esc(base.source) + (base.calibrated ? "（已校准）" : "（未校准）")
        : "原值：原标记已删除，确认后按新值建档";
      const newLine = "新值：" + esc(rec.depth) + " · " + Coords.formatLocal(rec.x, rec.y) + " · " + esc(rec.source) +
        (rec.calibrated ? "（已校准）" : "（未校准）") + (flags.shift != null ? " · 位移" + flags.shift + "m" : "");
      return '<div class="pending-item" data-id="' + rec.id + '">' +
        "<b>" + esc(rec.code) + '</b> <span class="pill">' + esc(rec.dive) + "</span>" + warns +
        '<div class="compare"><div>' + oldLine + "</div><div>" + newLine + "</div></div>" +
        '<div class="row"><button data-act="confirm">确认替换</button>' +
        '<button data-act="reject" class="secondary">驳回</button></div></div>';
    }).join("");
    pendingList.querySelectorAll("[data-act]").forEach(btn => btn.onclick = () => {
      const id = btn.closest("[data-id]").dataset.id;
      if (btn.dataset.act === "confirm") {
        Archive.confirmPending(id);
        say("已确认替换，旧值已留存");
      } else {
        Archive.rejectPending(id);
        say("已驳回，原标记继续有效");
      }
      render();
    });
  }

  function edit(id) {
    const mark = Archive.findMark(id);
    if (!mark) return;
    ["id", "code", "type", "dive", "source", "depth", "orientation", "condition", "note"]
      .forEach(key => { if (form[key]) form[key].value = mark[key] ?? ""; });
    form.calibrated.value = String(mark.calibrated !== false);
    picked = { x: mark.x, y: mark.y };
    showPicked();
    updateCodeHint();
    render();
  }

  map.addEventListener("click", event => {
    const rect = map.getBoundingClientRect();
    picked = {
      x: Number(((event.clientX - rect.left) / rect.width * 100).toFixed(2)),
      y: Number(((event.clientY - rect.top) / rect.height * 100).toFixed(2))
    };
    form.reset();
    form.id.value = "";
    form.code.value = nextCode();
    form.dive.value = lastDive();
    form.calibrated.value = "true";
    showPicked();
    updateCodeHint();
    formMsg.textContent = "";
    render();
  });

  function nextCode() {
    let n = Archive.allMarks().length + 1;
    while (Archive.findByCode("M-" + String(n).padStart(3, "0"))) n++;
    return "M-" + String(n).padStart(3, "0");
  }

  function lastDive() {
    const marks = Archive.allMarks();
    return marks.length ? marks[marks.length - 1].dive : "DIVE-01";
  }

  function showPicked() {
    pickedInfo.textContent = picked ? "图上位置：" + Coords.formatLocal(picked.x, picked.y) : "";
  }

  function updateCodeHint() {
    const code = form.code.value.trim();
    const base = code ? Archive.findByCode(code) : null;
    const dup = base && base.id !== form.id.value;
    codeHint.textContent = dup ? "该编号已存在：保存后作为复测记录进入待确认区，确认后才替换原值。" : "";
  }

  function say(text) { formMsg.textContent = text; }

  form.code.addEventListener("input", updateCodeHint);

  form.onsubmit = event => {
    event.preventDefault();
    if (!picked) picked = { x: 50, y: 50 };
    const data = Object.fromEntries(new FormData(form).entries());
    data.calibrated = data.calibrated === "true";
    data.x = picked.x;
    data.y = picked.y;
    const result = Archive.submit(data);
    if (result.status === "pending") say("同编号复测记录已放入待确认区，确认后才替换原值");
    else if (result.status === "updated") say("标记信息已更新");
    else say("已新增标记 " + result.mark.code);
    form.reset();
    form.id.value = "";
    picked = null;
    showPicked();
    updateCodeHint();
    render();
  };

  document.querySelector("#deleteBtn").onclick = () => {
    if (!form.id.value) return;
    Archive.removeMark(form.id.value);
    form.reset();
    picked = null;
    showPicked();
    updateCodeHint();
    say("已删除标记");
    render();
  };

  document.querySelector("#exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify(Archive.exportPayload(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dive-marks.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // 潜次结束：回到按编号处理待确认记录
  document.querySelector("#endDiveBtn").onclick = () => {
    pendingPanel.scrollIntoView({ behavior: "smooth" });
    pendingPanel.classList.remove("flash");
    void pendingPanel.offsetWidth;
    pendingPanel.classList.add("flash");
  };

  filter.onchange = render;
  view.onchange = render;
  pendingDive.onchange = renderPending;

  render();
})();
