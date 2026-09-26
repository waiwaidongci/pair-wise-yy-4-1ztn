// 坐标换算：平面图百分比坐标与经纬度互转、深度解析与变化计算
window.Coords = (() => {
  // 站点基准：平面图左上角对应的经纬度与覆盖范围（米）
  const SITE = {
    originLat: 24.4821,   // 平面图北缘纬度
    originLon: 118.0672,  // 平面图西缘经度
    widthMeters: 220,     // 平面图东西跨度
    heightMeters: 160     // 平面图南北跨度
  };
  const METERS_PER_DEG_LAT = 111320;
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos(SITE.originLat * Math.PI / 180);
  const DEPTH_JUMP_LIMIT = 0.2; // 深度变化阈值：原值的两成

  // 图上百分比坐标 -> 经纬度
  function toGeo(x, y) {
    const east = x / 100 * SITE.widthMeters;
    const south = y / 100 * SITE.heightMeters;
    return {
      lat: +(SITE.originLat - south / METERS_PER_DEG_LAT).toFixed(7),
      lon: +(SITE.originLon + east / metersPerDegLon).toFixed(7)
    };
  }

  // 经纬度 -> 图上百分比坐标
  function toMap(lat, lon) {
    const south = (SITE.originLat - lat) * METERS_PER_DEG_LAT;
    const east = (lon - SITE.originLon) * metersPerDegLon;
    return {
      x: +(east / SITE.widthMeters * 100).toFixed(2),
      y: +(south / SITE.heightMeters * 100).toFixed(2)
    };
  }

  // 本地网格坐标（米），便于考古记录引用
  function gridRef(x, y) {
    return {
      east: +(x / 100 * SITE.widthMeters).toFixed(1),
      south: +(y / 100 * SITE.heightMeters).toFixed(1)
    };
  }

  // 深度统一解析为数值（米），兼容 "18.4m" 这类旧记录
  function parseDepth(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const match = String(value || "").match(/-?\d+(\.\d+)?/);
    return match ? +match[0] : null;
  }

  // 深度变化率：|新值 - 原值| / 原值
  function depthChangeRatio(oldDepth, newDepth) {
    const before = parseDepth(oldDepth);
    const after = parseDepth(newDepth);
    if (!before || after == null) return 0;
    return Math.abs(after - before) / Math.abs(before);
  }

  function formatDepth(depth) {
    const value = parseDepth(depth);
    return value == null ? "—" : value.toFixed(1) + "m";
  }

  function formatGeo(geo) {
    return geo.lat.toFixed(5) + "°N, " + geo.lon.toFixed(5) + "°E";
  }

  return { SITE, DEPTH_JUMP_LIMIT, toGeo, toMap, gridRef, parseDepth, depthChangeRatio, formatDepth, formatGeo };
})();
