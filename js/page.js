// 页面操作：地图、表单、列表、时间线与待确认区的渲染和交互
const map = document.querySelector("#map");
const form = document.querySelector("#form");
const list = document.querySelector("#list");
const filter = document.querySelector("#filter");
const view = document.querySelector("#view");
const listTitle = document.querySelector("#listTitle");
const pendingList = document.querySelector("#pendingList");
const pendingCount = document.querySelector("#pendingCount");
const pendingBanner = document.querySelector("#pendingBanner");
const endDiveSelect = document.querySelector("#endDiveSelect");
const notice = document.querySelector("#notice");
const pickHint = document.querySelector("#pickHint");
const typeNames = { ceramic: "陶片", wood: "木构件", metal: "金属件", unknown: "未知物" };
const flagNames = { depthJump: "深度变化超两成", uncalibrated: "定位来源未校准" };
let picked = null;      // 图上落点（百分比坐标）
let pendingDive = "";   // 待确认区当前聚焦的已结束潜次

for (let i = 0; i < 7; i++) {
  const rib = document.createElement("div");
  rib.className = "rib";
  rib.style.left = 28 + i * 7 + "%";
  map.appendChild(rib);
}

const geoText = (x, y) => Coords.formatGeo(Coords.toGeo(x, y));
const sourceText = record => record.source + (record.calibrated ? "" : "（未校准）");

function showPick() {
  pickHint.textContent = picked
    ? "图上落点：" + picked.x + "%, " + picked.y + "%（" + geoText(picked.x, picked.y) + "）"
    : "";
}

function render() {
  renderMap();
  if (view.value === "timeline") renderTimeline();
  else renderList();
  renderPending();
  renderDiveSelect();
}

function renderMap() {
  map.querySelectorAll(".marker").forEach(el => el.remove());
  const marks = Archive.list();
  const filtered = filter.value ? marks.filter(m => m.type === filter.value) : marks;
  filtered.forEach(mark => {
    const el = document.createElement("button");
    el.className = "marker " + mark.type
      + (mark.id === form.id.value ? " selected" : "")
      + (Archive.hasPending(mark.id) ? " has-pending" : "");
    el.style.left = mark.x + "%";
    el.style.top = mark.y + "%";
    el.textContent = mark.code.slice(0, 2);
    el.title = mark.code + " " + Coords.formatDepth(mark.depth);
    el.onclick = event => { event.stopPropagation(); edit(mark.id); };
    map.appendChild(el);
  });
  if (picked && !form.id.value) {
    const ghost = document.createElement("div");
    ghost.className = "marker picked";
    ghost.style.left = picked.x + "%";
    ghost.style.top = picked.y + "%";
    map.appendChild(ghost);
  }
}

function renderList() {
  listTitle.textContent = "标记列表";
  list.className = "list";
  const marks = Archive.list();
  const data = filter.value ? marks.filter(m => m.type === filter.value) : marks;
  list.innerHTML = data.map(m =>
    '<div class="item ' + (m.id === form.id.value ? "active" : "") + '" data-id="' + m.id + '">'
    + "<b>" + m.code + "</b> <span class=\"pill\">" + typeNames[m.type] + "</span>"
    + (Archive.hasPending(m.id) ? ' <span class="pill warn">有待确认</span>' : "")
    + '<div class="muted">' + m.dive + " · " + Coords.formatDepth(m.depth) + " · " + (m.orientation || "") + "</div>"
    + '<div class="muted">' + sourceText(m) + " · " + geoText(m.x, m.y) + "</div>"
    + "<div>" + (m.condition || "") + "</div></div>"
  ).join("");
  list.querySelectorAll("[data-id]").forEach(el => el.onclick = () => edit(el.dataset.id));
}

function renderTimeline() {
  listTitle.textContent = "潜次时间线";
  list.className = "timeline";
  const marks = Archive.list();
  const data = filter.value ? marks.filter(m => m.type === filter.value) : marks;
  const groups = data.reduce((acc, item) => ((acc[item.dive] ||= []).push(item), acc), {});
  list.innerHTML = Object.entries(groups).map(([dive, items]) => {
    const logs = Archive.historyList().filter(h => h.dive === dive)
      .map(h => '<div class="muted">复测替换 ' + h.code + "：深度 " + Coords.formatDepth(h.previous.depth) + " → " + Coords.formatDepth(h.next.depth) + "</div>")
      .join("");
    return '<div class="item"><b>' + dive + "</b>"
      + (Archive.isEnded(dive) ? ' <span class="pill warn">已结束</span>' : "")
      + '<div class="muted">新增' + items.length + "个标记</div>"
      + items.map(i => "<div>" + i.code + " · " + typeNames[i.type] + "</div>").join("")
      + logs + "</div>";
  }).join("");
}

// 待确认区：列出原值和新值，确认后才替换，原标记继续有效
function renderPending() {
  const items = Archive.pendingByCode(pendingDive);
  pendingCount.textContent = items.length + " 条";
  if (pendingDive) {
    pendingBanner.innerHTML = '潜次 <b>' + pendingDive + '</b> 已结束，请按编号处理以下待确认记录 '
      + '<button type="button" class="secondary" id="showAllPending">显示全部</button>';
    pendingBanner.querySelector("#showAllPending").onclick = () => { pendingDive = ""; render(); };
  } else {
    pendingBanner.innerHTML = "";
  }
  pendingList.innerHTML = items.map(p => {
    const target = Archive.findById(p.targetId);
    const flags = p.flags.map(f => '<span class="flag">' + flagNames[f] + "</span>").join("");
    const compare = target
      ? '<div class="compare"><div><b>原值</b><br>深度 ' + Coords.formatDepth(target.depth)
        + "<br>" + geoText(target.x, target.y) + "<br>" + sourceText(target) + "</div>"
        + "<div><b>新值</b><br>深度 " + Coords.formatDepth(p.depth)
        + "<br>" + geoText(p.x, p.y) + "<br>" + sourceText(p) + "</div></div>"
      : '<div class="muted">原标记已删除，确认后将作为新标记落档</div>';
    return '<div class="item pending-item" data-pid="' + p.id + '"><b>' + p.code + "</b> "
      + '<span class="pill">' + p.dive + "</span> " + flags + compare
      + '<div class="toolbar"><button data-act="confirm">确认替换</button>'
      + '<button data-act="reject" class="secondary">驳回</button></div></div>';
  }).join("") || '<div class="muted">暂无待确认记录</div>';
  pendingList.querySelectorAll("[data-act]").forEach(btn => btn.onclick = () => {
    const id = btn.closest("[data-pid]").dataset.pid;
    if (btn.dataset.act === "confirm") {
      Archive.confirmPending(id);
      notice.textContent = "已确认替换，旧值已存入复测档案";
    } else {
      Archive.rejectPending(id);
      notice.textContent = "已驳回，原标记继续有效";
    }
    render();
  });
}

function renderDiveSelect() {
  const current = endDiveSelect.value;
  endDiveSelect.innerHTML = Archive.dives()
    .map(d => "<option" + (d === current ? " selected" : "") + ">" + d + "</option>").join("");
}

function edit(id) {
  const mark = Archive.findById(id);
  if (!mark) return;
  form.id.value = mark.id;
  form.code.value = mark.code;
  form.type.value = mark.type;
  form.dive.value = mark.dive;
  form.depth.value = mark.depth;
  form.source.value = mark.source;
  form.calibrated.checked = !!mark.calibrated;
  form.orientation.value = mark.orientation || "";
  form.condition.value = mark.condition || "";
  form.note.value = mark.note || "";
  picked = { x: mark.x, y: mark.y };
  showPick();
  render();
}

map.addEventListener("click", event => {
  const rect = map.getBoundingClientRect();
  picked = {
    x: +((event.clientX - rect.left) / rect.width * 100).toFixed(2),
    y: +((event.clientY - rect.top) / rect.height * 100).toFixed(2)
  };
  const lastDive = form.dive.value || "DIVE-01";
  form.reset();
  form.id.value = "";
  form.code.value = "M-" + String(Archive.list().length + 1).padStart(3, "0");
  form.dive.value = lastDive;
  showPick();
  render();
});

form.onsubmit = event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  data.calibrated = form.calibrated.checked;
  const target = Archive.findByCode(data.code) || Archive.findById(data.id);
  const coords = picked || (target ? { x: target.x, y: target.y } : { x: 50, y: 50 });
  const result = Archive.saveSurvey({ ...data, ...coords });
  const dive = data.dive;
  form.reset();
  picked = null;
  form.dive.value = dive;
  showPick();
  notice.textContent = result.kind === "pending"
    ? data.code + " 与原标记同编号，已进入待确认区" + (result.flags.length ? "（" + result.flags.map(f => flagNames[f]).join("、") + "）" : "")
    : "已保存新标记 " + data.code;
  render();
};

document.querySelector("#deleteBtn").onclick = () => {
  if (!form.id.value) return;
  Archive.removeMark(form.id.value);
  form.reset();
  picked = null;
  showPick();
  render();
};

document.querySelector("#endDiveBtn").onclick = () => {
  const dive = endDiveSelect.value;
  if (!dive) return;
  const queue = Archive.endDive(dive);
  pendingDive = dive;
  notice.textContent = "潜次 " + dive + " 已结束，待确认区按编号列出 " + queue.length + " 条记录";
  render();
};

document.querySelector("#exportBtn").onclick = () => {
  const blob = new Blob([JSON.stringify(Archive.exportData(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "dive-archive.json";
  a.click();
  URL.revokeObjectURL(a.href);
};

filter.onchange = render;
view.onchange = render;
render();
