/* Original schematic geometry. Station order comes from METRO_DATA; this is not a geographic map. */
(() => {
  "use strict";
  const lines = window.METRO_DATA.lines;
  const anchors = {
    "和光市": [80, 105], "地下鉄成増": [135, 130], "地下鉄赤塚": [190, 153],
    "平和台": [245, 176], "氷川台": [300, 198], "小竹向原": [355, 220],
    "千川": [425, 235], "要町": [495, 247], "池袋": [570, 260],
    "荻窪": [100, 400], "中野": [205, 390], "中野坂上": [325, 485],
    "方南町": [180, 570], "新宿": [445, 505], "新宿三丁目": [505, 515],
    "四ツ谷": [615, 550], "赤坂見附": [710, 580], "永田町": [690, 630],
    "市ケ谷": [695, 455], "飯田橋": [795, 370], "後楽園": [865, 290],
    "九段下": [855, 455], "半蔵門": [780, 515], "神保町": [925, 465],
    "大手町": [1005, 550], "東京": [1030, 640], "御茶ノ水": [965, 395],
    "新御茶ノ水": [1015, 425], "淡路町": [1055, 450],
    "渋谷": [340, 750], "明治神宮前〈原宿〉": [445, 700],
    "表参道": [525, 705], "青山一丁目": [615, 665],
    "代々木上原": [175, 700], "乃木坂": [630, 750], "赤坂": [710, 715],
    "国会議事堂前": [800, 675], "溜池山王": [800, 640],
    "六本木": [685, 830], "六本木一丁目": [760, 775],
    "霞ケ関": [875, 745], "日比谷": [950, 755], "有楽町": [990, 790],
    "銀座": [1080, 765], "銀座一丁目": [1100, 815],
    "新橋": [1000, 850], "虎ノ門": [890, 800], "虎ノ門ヒルズ": [815, 790],
    "目黒": [585, 990], "中目黒": [355, 920], "恵比寿": [480, 890],
    "日本橋": [1110, 610], "三越前": [1135, 545], "神田": [1130, 485],
    "茅場町": [1210, 650], "水天宮前": [1250, 600],
    "上野": [1220, 365], "秋葉原": [1170, 425],
    "浅草": [1390, 315], "押上〈スカイツリー前〉": [1510, 380],
    "清澄白河": [1350, 630], "北千住": [1370, 155],
    "綾瀬": [1455, 135], "北綾瀬": [1510, 95],
    "西日暮里": [1195, 265], "駒込": [1030, 215],
    "赤羽岩淵": [1190, 100], "門前仲町": [1290, 730],
    "東陽町": [1390, 760], "西船橋": [1540, 815],
    "新富町": [1160, 855], "月島": [1245, 885], "豊洲": [1350, 930],
    "新木場": [1475, 1010], "高田馬場": [475, 335],
    "雑司が谷": [535, 340], "東新宿": [520, 445],
    "麻布十番": [700, 875], "白金高輪": [655, 935],
    "新宿御苑前": [550, 535], "新大塚": [690, 245]
  };
  const majorLabels = [
    ["和光市", -12, -24, "end"], ["荻窪", -14, -18, "end"],
    ["中野", -12, -20, "end"], ["方南町", -13, 31, "end"],
    ["池袋", -8, -28, "end"], ["新宿", -8, 32, "end"],
    ["渋谷", -14, 32, "end"], ["表参道", -8, -25, "end"],
    ["六本木", -12, 31, "end"], ["目黒", -12, 32, "end"],
    ["中目黒", -10, 32, "end"], ["永田町", -10, 33, "end"],
    ["飯田橋", -10, -24, "end"], ["後楽園", 14, -18, "start"],
    ["九段下", -12, 30, "end"], ["大手町", 16, 30, "start"],
    ["東京", -10, 33, "end"], ["霞ケ関", -12, -25, "end"],
    ["銀座", 13, 30, "start"], ["新橋", -10, 32, "end"],
    ["日本橋", 16, 24, "start"], ["上野", 15, -17, "start"],
    ["浅草", 12, -20, "start"], ["北千住", 12, 34, "start"],
    ["北綾瀬", -8, -22, "end"], ["赤羽岩淵", 14, -10, "start"],
    ["押上〈スカイツリー前〉", -6, 37, "end"],
    ["西船橋", -8, -22, "end"], ["新木場", -10, 33, "end"]
  ];
  const esc = value => String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[ch]);
  const fmt = number => Math.round(number * 10) / 10;
  const routes = new Map();
  const stationsByName = new Map();
  for (const line of lines) {
    const known = line.stations.map((s, i) => anchors[s.name] ? i : -1).filter(i => i >= 0);
    if (known[0] !== 0 || known.at(-1) !== line.stations.length - 1) throw Error("Missing endpoint in metro schematic: " + line.id);
    const points = line.stations.map((station, index) => {
      if (anchors[station.name]) return anchors[station.name];
      const before = known.filter(i => i < index).at(-1);
      const after = known.find(i => i > index);
      const t = (index - before) / (after - before);
      return [fmt(anchors[line.stations[before].name][0] * (1 - t) + anchors[line.stations[after].name][0] * t),
        fmt(anchors[line.stations[before].name][1] * (1 - t) + anchors[line.stations[after].name][1] * t)];
    });
    routes.set(line.id, points);
    line.stations.forEach((s, i) => {
      if (!stationsByName.has(s.name)) stationsByName.set(s.name, {name:s.name, point:points[i], lines:[]});
      stationsByName.get(s.name).lines.push(line.id);
    });
  }
  function overview({activeLineId = null, currentStationId = null, goalStationId = null, preview = false} = {}) {
    const sorted = [...lines].sort((a,b) => (a.id === activeLineId ? 1 : 0) - (b.id === activeLineId ? 1 : 0));
    const routePaths = sorted.map(line => {
      const points = routes.get(line.id), d = points.map(([x,y],i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
      const faded = activeLineId && line.id !== activeLineId ? " muted-line" : "";
      return `<g class="network-route${faded}" data-route="${line.id}"><path class="route-casing" d="${d}"/><path class="route-color" d="${d}" stroke="${line.color}"/></g>`;
    }).join("");
    const dots = [...stationsByName.values()].map(s => {
      const [x,y] = s.point, isTransfer = s.lines.length > 1;
      const faded = activeLineId && !s.lines.includes(activeLineId) ? " muted-station" : "";
      return `<g class="network-station${faded}" transform="translate(${x} ${y})"><title>${esc(s.name)}駅 · ${esc(s.lines.join(" / "))}</title><circle r="${isTransfer ? 6 : 3.5}"/></g>`;
    }).join("");
    const labels = majorLabels.map(([name,dx,dy,align]) => {
      const s=stationsByName.get(name); if (!s) return "";
      const [x,y]=s.point, short=name.replace(/〈.*〉/, "");
      const faded=activeLineId && !s.lines.includes(activeLineId) ? " muted-station" : "";
      return `<text class="network-label${faded}" x="${x+dx}" y="${y+dy}" text-anchor="${align}">${esc(short)}</text>`;
    }).join("");
    const active = lines.find(line => line.id === activeLineId);
    const marker = (id, kind) => {
      if (!active || !id) return "";
      const index = active.stations.findIndex(s => s.id === id);
      if (index < 0) return "";
      const [x,y] = routes.get(active.id)[index];
      return `<g class="network-marker ${kind}" transform="translate(${x} ${y})"><circle class="marker-halo" r="17"/><circle class="marker-core" r="8"/><title>${kind === "now" ? "現在地" : "ゴール"}：${esc(active.stations[index].name)}駅</title></g>`;
    };
    const viewBox = preview ? "255 185 1140 745" : "0 0 1600 1080";
    return `<svg class="network-svg${preview ? " is-preview" : ""}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="東京メトロ全9路線の独自模式図。各路線の駅順と主な接続駅を示します"><title>きまぐれメトロ旅 路線図</title><defs><pattern id="map-grid${preview ? "-preview" : ""}" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#dbe5e1" stroke-width=".8"/></pattern></defs><rect width="1600" height="1080" fill="#f7f8f3"/><rect width="1600" height="1080" fill="url(#map-grid${preview ? "-preview" : ""})"/>${routePaths}${dots}${labels}${marker(goalStationId,"goal")}${marker(currentStationId,"now")}</svg>`;
  }
  function lineDiagram(line, game) {
    const stops = line.stations, step = 96, width = (stops.length - 1) * step + 90;
    const at = stops.findIndex(s => s.id === game.currentStationId);
    const goal = stops.findIndex(s => s.id === game.goalStationId);
    const start = stops.findIndex(s => s.id === game.startStationId);
    const progress = at >= 0 && start >= 0 ? `<path d="M${45+start*step} 43H${45+at*step}" stroke="#10252b" stroke-width="7" fill="none"/>` : "";
    const nodes = stops.map((s,i) => {
      const x=45+i*step, special=i===at?" now":i===goal?" goal":"";
      return `<g class="line-svg-node${special}"><title>${esc(s.name)}駅 ${esc(s.id)}</title><circle cx="${x}" cy="43" r="${special ? 11 : 7}"/><text class="line-code" x="${x}" y="18" text-anchor="middle">${esc(s.id)}</text><text x="${x}" y="78" text-anchor="middle">${esc(s.name.replace(/〈.*〉/, ""))}</text></g>`;
    }).join("");
    return `<svg class="line-svg" viewBox="0 0 ${width} 100" width="${width}" height="100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(line.name)}の全${stops.length}駅。現在駅とゴールを表示"><path d="M45 43H${45+(stops.length-1)*step}" stroke="${line.color}" stroke-width="7" fill="none" stroke-linecap="round"/>${progress}${nodes}</svg>`;
  }
  window.METRO_MAP = {overview, lineDiagram, stationCount:stationsByName.size, anchors, routes};
})();
