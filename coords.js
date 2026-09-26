// 坐标换算：平面图百分比坐标与局部网格（米）互算，深度解析与变化率
window.Coords = (() => {
  // 平面图对应的实际范围：东西 60m、南北 40m，原点取图左上角
  const GRID = { east: 60, south: 40 };

  // 百分比坐标 -> 局部网格（米）：e 向东、s 向南
  function toLocal(xPct, yPct) {
    return {
      e: +(xPct / 100 * GRID.east).toFixed(2),
      s: +(yPct / 100 * GRID.south).toFixed(2)
    };
  }

  // 局部网格（米）-> 百分比坐标
  function fromLocal(e, s) {
    return {
      x: +(e / GRID.east * 100).toFixed(2),
      y: +(s / GRID.south * 100).toFixed(2)
    };
  }

  function formatLocal(xPct, yPct) {
    const p = toLocal(xPct, yPct);
    return "E" + p.e.toFixed(1) + "m · S" + p.s.toFixed(1) + "m";
  }

  // 两个图上点位（{x, y} 百分比）之间的实际距离（米）
  function distance(a, b) {
    const pa = toLocal(a.x, a.y);
    const pb = toLocal(b.x, b.y);
    return +Math.hypot(pa.e - pb.e, pa.s - pb.s).toFixed(2);
  }

  // "18.4m" -> 18.4；无法解析时返回 null
  function parseDepth(text) {
    const m = String(text == null ? "" : text).match(/-?\d+(\.\d+)?/);
    return m ? +m[0] : null;
  }

  function formatDepth(meters) {
    return meters == null ? "" : (+meters).toFixed(1) + "m";
  }

  // 深度变化率（相对原值）；任一值缺失或原值为 0 时返回 null
  function depthChangeRatio(oldDepth, newDepth) {
    const o = parseDepth(oldDepth);
    const n = parseDepth(newDepth);
    if (o == null || n == null || o === 0) return null;
    return (n - o) / o;
  }

  return { GRID, toLocal, fromLocal, formatLocal, distance, parseDepth, formatDepth, depthChangeRatio };
})();
