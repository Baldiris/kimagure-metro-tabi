(() => {
  "use strict";
  const KEY = "kimagure-metro-v1";
  const COLLECTION_KEY = "kimagure-metro-collection-v1";
  const lines = window.METRO_DATA.lines;
  const metroMap = window.METRO_MAP;
  let line = lines[0];
  let stations = line.stations;
  const setLine = (id) => {
    const selected = lines.find(item => item.id === id);
    if (!selected) return false;
    line = selected;
    stations = selected.stations;
    return true;
  };
  const lineName = () => line.name.replace("（分岐線）", "（方南町支線）");
  const app = document.getElementById("app");
  const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random();
  const random = (n) => {
    if (crypto.getRandomValues) {
      const a = new Uint32Array(1);
      const limit = Math.floor(0x100000000 / n) * n;
      do { crypto.getRandomValues(a); } while (a[0] >= limit);
      return a[0] % n;
    }
    return Math.floor(Math.random() * n);
  };
  const byId = (id) => stations.findIndex(s => s.id === id);
  const station = (id) => stations[byId(id)];
  const crossLine = () => game?.travelMode === "network";
  const lineById = id => lines.find(item => item.id === id);
  const routeStop = index => game?.routeStops?.[index];
  const currentName = () => crossLine() && game.routeStops ? routeStop(game.routeIndex)?.name : label(game?.currentStationId);
  const goalName = () => crossLine() && game.routeStops ? game.routeStops.at(-1).name : label(game?.goalStationId);
  const pendingName = () => crossLine() && game.routeStops ? routeStop(game.pendingIndex)?.name : label(game?.pendingStationId);
  let game = null;
  let view = "game";
  let mapReturnView = "game";
  let collectionReturnView = "game";
  let historyReturnView = "game";
  let mapFocusId = null;
  let mapSelectedName = null;
  let mapFrom = null;
  let mapTo = null;
  let mapZoom = 1;
  let mapSearchQuery = "";
  let busy = false;
  let lotteryPreview = null;
  let displayStation = null;
  let diceDisplay = null;
  let restoreError = false;
  let collection = { version:1, visits:{}, journeys:[], completedCount:0 };
  let hasCollection = false;

  try {
    const raw = localStorage.getItem(COLLECTION_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.version === 1 && saved.visits && typeof saved.visits === "object" &&
          Array.isArray(saved.journeys) && Number.isInteger(saved.completedCount)) {
        collection = saved;
        hasCollection = true;
      }
    }
  } catch (e) { /* An invalid collection can be started again without losing the current trip. */ }

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.schemaVersion !== 1 || !saved.gameState ||
          (saved.travelMode && !["single","network"].includes(saved.travelMode)) ||
          (saved.lineId ? !setLine(saved.lineId) : !["MODE_SELECTION","LINE_SELECTION"].includes(saved.gameState)) ||
          (saved.travelMode === "network" && saved.goalStationId &&
            (!Array.isArray(saved.routeStops) || saved.routeStops.length < 2 ||
             !Number.isInteger(saved.routeIndex) || saved.routeIndex < 0 || saved.routeIndex >= saved.routeStops.length ||
             !saved.routeStops.every(stop => lineById(stop.lineId)?.stations.some(s => s.id === stop.id && s.name === stop.name)))) ||
          (saved.travelMode !== "network" && ((saved.startStationId && byId(saved.startStationId) < 0) ||
          (saved.goalStationId && byId(saved.goalStationId) < 0) ||
          (saved.currentStationId && byId(saved.currentStationId) < 0) ||
          (saved.pendingStationId && byId(saved.pendingStationId) < 0)))) throw Error("invalid save");
      game = saved;
      view = "landing";
    }
  } catch (e) { restoreError = true; game = null; }

  function persistCollection() {
    try { localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection)); }
    catch (e) { /* The current session still keeps its collection. */ }
  }
  function addVisit(visit) {
    const stationLine = lineById(visit.lineId);
    if (!stationLine?.stations.some(s => s.id === visit.stationId && s.name === visit.stationName)) return;
    const previous = collection.visits[visit.stationName];
    collection.visits[visit.stationName] = {
      firstAt: previous?.firstAt || visit.arrivedAt,
      lastAt: visit.arrivedAt,
      count: (previous?.count || 0) + 1,
      lineIds: [...new Set([...(previous?.lineIds || []), visit.lineId])]
    };
  }
  function addCompletion(source) {
    if (collection.journeys.some(j => j.id === source.gameId)) return;
    const from = source.travelMode === "network" ? source.routeStops?.[0]?.name :
      lineById(source.lineId)?.stations.find(s => s.id === source.startStationId)?.name;
    const to = source.visitHistory.at(-1)?.stationName;
    if (!from || !to) return;
    collection.completedCount++;
    collection.journeys.unshift({id:source.gameId,from,to,mode:source.travelMode,
      date:source.visitHistory.at(-1).arrivedAt,hops:source.travelMode === "network" ?
      source.networkJourney?.hops : Math.abs(lineById(source.lineId).stations.findIndex(s => s.id === source.startStationId) -
      lineById(source.lineId).stations.findIndex(s => s.id === source.goalStationId))});
    collection.journeys = collection.journeys.slice(0,30);
  }
  if (!hasCollection && game?.visitHistory?.length) {
    game.visitHistory.forEach(addVisit);
    if (game.gameState === "GOAL") addCompletion(game);
    persistCollection();
  }

  function save(patch) {
    game = { ...game, ...patch, updatedAt: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(game)); }
    catch (e) { /* Browsers denying storage still allow a session. */ }
    render();
  }
  function reset() {
    game = null; view = "game"; restoreError = false;
    try { localStorage.removeItem(KEY); } catch (e) {}
    render();
  }
  function start() {
    game = {
      schemaVersion: 1, gameId: uuid(), gameState: "MODE_SELECTION", travelMode: null, distance:"short",
      lineId: null, startStationId: null, goalStationId: null,
      currentStationId: null, pendingStationId: null,
      routeStops: null, networkJourney: null, routeIndex: 0, pendingIndex: null,
      direction: 0, lastDice: null, visitHistory: [],
      updatedAt: new Date().toISOString()
    };
    view = "game";
    save({});
  }
  function selectMode(mode) {
    if (busy || game?.gameState !== "MODE_SELECTION" || !["single","network"].includes(mode)) return;
    save({ travelMode: mode, gameState: "LINE_SELECTION" });
  }
  function selectLine(id) {
    if (busy || game?.gameState !== "LINE_SELECTION" || !setLine(id)) return;
    save({ lineId: id, gameState: "START_LOTTERY" });
  }
  function chooseStart() {
    if (busy || game?.gameState !== "START_LOTTERY") return;
    busy = true;
    const selected = stations[random(stations.length)];
    lotteryPreview = { kind: "START STATION", finalName: selected.name };
    // Save the actual result before animating; a reload never rerolls it.
    save({ startStationId: selected.id, currentStationId: selected.id, gameState: "GOAL_LOTTERY" });
    runReel(selected.name);
  }
  function setStart(id) {
    if (busy || game?.gameState !== "START_LOTTERY") return;
    const selected = stations.find(s => s.id === id);
    if (!selected) return;
    save({ startStationId:selected.id, currentStationId:selected.id, gameState:"GOAL_LOTTERY" });
  }
  function chooseGoal() {
    if (busy || game?.gameState !== "GOAL_LOTTERY") return;
    busy = true;
    if (crossLine()) {
      const from = station(game.startStationId).name;
      const startNames = new Set(stations.map(s => s.name));
      const candidates = [...metroMap.stations.keys()].filter(name => !startNames.has(name));
      const shuffled = candidates.map(name => ({name, order: random(0x10000)})).sort((a,b) => a.order-b.order);
      const short = game.distance === "short";
      const targetHops = short ? 6 : 11;
      let selected = null, fallback = null;
      for (const {name} of shuffled) {
        const journey = metroMap.findRoute(from,name,{startLineId:line.id});
        if (!journey || journey.transfers < 1) continue;
        if (!fallback || Math.abs(journey.hops-targetHops) < Math.abs(fallback.hops-targetHops)) fallback = journey;
        if (journey.hops >= (short ? 3 : 6) && journey.hops <= (short ? 8 : 16) && journey.transfers <= 2) { selected = journey; break; }
      }
      const journey = selected || fallback;
      if (!journey) { busy = false; render(); return; }
      const routeStops = [];
      for (const node of journey.path) {
        if (routeStops.at(-1)?.name === node.name) continue;
        routeStops.push({name:node.name, id:lineById(node.lineId).stations[node.index].id, lineId:node.lineId});
      }
      const final = routeStops.at(-1);
      lotteryPreview = {kind:"DESTINATION",finalName:final.name};
      save({goalStationId:final.id,routeStops,networkJourney:journey,routeIndex:0,pendingIndex:null,direction:0,gameState:"READY_TO_ROLL"});
      runReel(final.name);
      return;
    }
    const startIndex = byId(game.startStationId);
    const nearby = stations.filter((s,i) => i !== startIndex && Math.abs(i-startIndex) <= 6);
    const goal = game.distance === "short" ? nearby[random(nearby.length)] :
      stations[(startIndex + 1 + random(stations.length - 1)) % stations.length];
    lotteryPreview = { kind: "DESTINATION", finalName: goal.name };
    const direction = Math.sign(byId(goal.id) - startIndex);
    save({ goalStationId: goal.id, direction, gameState: "READY_TO_ROLL" });
    runReel(goal.name);
  }
  function runReel(finalName) {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { busy = false; lotteryPreview = null; render(); return; }
    let count = 0;
    const timer = setInterval(() => {
      displayStation = lotteryPreview?.kind === "DESTINATION" && crossLine()
        ? [...metroMap.stations.keys()][random(metroMap.stations.size)]
        : stations[random(stations.length)].name;
      render();
      if (++count >= 11) {
        clearInterval(timer);
        displayStation = finalName; render();
        setTimeout(() => { displayStation = null; lotteryPreview = null; busy = false; render(); }, 380);
      }
    }, 75);
  }
  function roll() {
    if (busy || game?.gameState !== "READY_TO_ROLL") return;
    busy = true;
    const value = 1 + random(6);
    if (crossLine()) {
      const from = game.routeIndex;
      const pendingIndex = Math.min(from + value,game.routeStops.length-1);
      const actual = routeStop(pendingIndex);
      save({pendingStationId:actual.id,pendingIndex,lastDice:value,gameState:"TRAVELING"});
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) { busy = false; render(); return; }
      let step = 0;
      diceDisplay = 1 + random(6);
      const timer = setInterval(() => {
        diceDisplay = 1 + random(6);
        if (step < pendingIndex-from) displayStation = routeStop(from + ++step).name;
        render();
        if (step >= pendingIndex-from) {
          clearInterval(timer);
          diceDisplay = value; displayStation = actual.name; render();
          setTimeout(() => { diceDisplay = null; displayStation = null; busy = false; render(); }, 550);
        }
      }, 250);
      return;
    }
    const from = byId(game.currentStationId);
    const goal = byId(game.goalStationId);
    const target = stations[Math.min(Math.max(from + value * game.direction, 0), stations.length - 1)];
    const actual = stations[game.direction > 0 ? Math.min(byId(target.id), goal) : Math.max(byId(target.id), goal)];
    // The pending stop is fixed and stored now. Only explicit arrival changes currentStationId.
    save({ pendingStationId: actual.id, lastDice: value, gameState: "TRAVELING" });
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { busy = false; render(); return; }
    let step = 0;
    const total = Math.abs(byId(actual.id) - from);
    diceDisplay = 1 + random(6);
    const timer = setInterval(() => {
      diceDisplay = 1 + random(6);
      if (step < total) {
        step++;
        displayStation = stations[from + step * game.direction].name;
      }
      render();
      if (step >= total) {
        clearInterval(timer);
        diceDisplay = value;
        displayStation = actual.name;
        render();
        setTimeout(() => { diceDisplay = null; displayStation = null; busy = false; render(); }, 550);
      }
    }, 250);
  }
  function arrive() {
    if (busy || game?.gameState !== "TRAVELING" || !game.pendingStationId) return;
    const stop = crossLine() ? routeStop(game.pendingIndex) : null;
    const target = crossLine() ? lineById(stop.lineId).stations.find(s => s.id === stop.id) : station(game.pendingStationId);
    const previousVisit = [...game.visitHistory].reverse().find(v => v.stationName === target.name);
    const quests = drawQuests(target,previousVisit?.quests.map(q=>q.id) || []);
    const isGoal = crossLine() ? game.pendingIndex === game.routeStops.length-1 : target.id === game.goalStationId;
    const visit = { visitId: uuid(), stationId: target.id, arrivedAt: new Date().toISOString(),
      lineId: stop?.lineId || line.id, stationName:target.name, diceValue: game.lastDice, quests, isGoal };
    addVisit(visit);
    if (isGoal) addCompletion({...game,visitHistory:[...game.visitHistory,visit]});
    persistCollection();
    save({
      currentStationId: target.id, pendingStationId: null,
      ...(crossLine() ? {routeIndex:game.pendingIndex,pendingIndex:null} : {}),
      visitHistory: [...game.visitHistory, visit],
      gameState: isGoal ? "GOAL" : "ARRIVED"
    });
  }
  function drawQuests(target, exclude = []) {
    const make = category => {
      const pool = target.quests.filter(q => q.category === category && !exclude.includes(q.id));
      const q = pool[random(pool.length)];
      return { ...q, stationId: target.id, drawnAt: new Date().toISOString(), completed:false };
    };
    return [make("街の手がかり"),make("小さな寄り道")];
  }
  function rerollQuests() {
    if (busy || !game || !["ARRIVED","GOAL"].includes(game.gameState)) return;
    const history = [...game.visitHistory], last = history.at(-1);
    if (!last || last.quests.some(q => q.completed)) return;
    const target = lineById(last.lineId || game.lineId)?.stations.find(s => s.id === last.stationId);
    if (!target) return;
    history[history.length-1] = { ...last, quests:drawQuests(target,last.quests.map(q=>q.id)) };
    save({visitHistory:history});
  }
  function toggleQuest(id) {
    if (!game || !["ARRIVED", "GOAL"].includes(game.gameState)) return;
    const history = [...game.visitHistory];
    const last = { ...history[history.length - 1] };
    if (!last) return;
    last.quests = last.quests.map(q => q.id === id ? { ...q, completed: !q.completed } : q);
    history[history.length - 1] = last;
    save({ visitHistory: history });
  }
  const label = (id) => station(id)?.name || lines.flatMap(item => item.stations).find(s => s.id === id)?.name || "—";
  const remaining = () => crossLine() && game.routeStops ? game.routeStops.length-1-game.routeIndex :
    game?.goalStationId ? Math.abs(byId(game.goalStationId) - byId(game.currentStationId)) : 0;
  const pct = () => {
    if (!game?.goalStationId) return 0;
    if (crossLine()) return Math.round(game.routeIndex / (game.routeStops.length-1) * 100);
    const length = Math.abs(byId(game.goalStationId) - byId(game.startStationId));
    return Math.round((1 - remaining() / length) * 100);
  };
  const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[ch]);
  function searchResults() {
    const query = mapSearchQuery.trim().toLocaleLowerCase();
    if (!query) return '<p class="map-search-hint">駅名や駅番号で検索。路線図の駅もタップできます。</p>';
    const results = [...metroMap.stations.values()].filter(s =>
      s.name.toLocaleLowerCase().includes(query) || s.lines.some(id =>
        lines.find(l => l.id === id).stations.some(stop => stop.name === s.name && stop.id.toLocaleLowerCase().includes(query))));
    if (!results.length) return '<p class="map-search-hint">該当する駅がありません。</p>';
    return `<div class="map-search-list">${results.slice(0,12).map(s => `<button data-action="map-station" data-station="${escapeHtml(s.name)}"><strong>${escapeHtml(s.name)}</strong><span>${s.lines.map(id => id === "Mb" ? "m" : id).join(" · ")}</span></button>`).join("")}</div>${results.length > 12 ? `<p class="map-search-hint">${results.length}件中12件を表示。名前を詳しく入力してください。</p>` : ""}`;
  }
  function stationDetail(name) {
    const found = metroMap.stations.get(name);
    if (!found) return "";
    const codes = found.lines.map(id => {
      const route = lines.find(item => item.id === id), stop = route.stations.find(s => s.name === name);
      return `<span class="station-line" style="--chip-color:${route.color}"><b>${escapeHtml(stop.id)}</b>${escapeHtml(route.name.replace("（分岐線）", "支線"))}</span>`;
    }).join("");
    return `<section class="station-detail" aria-label="選択した駅"><div class="station-detail-head"><div><span class="mini-label">SELECTED STATION</span><h3>${escapeHtml(name)}<small>駅</small></h3></div><span class="station-count">${found.lines.length}路線</span></div>
      <div class="station-lines">${codes}</div><div class="station-actions"><button data-action="map-from" data-station="${escapeHtml(name)}" aria-pressed="${mapFrom === name}">ここから出発</button><button data-action="map-to" data-station="${escapeHtml(name)}" aria-pressed="${mapTo === name}">ここに到着</button></div></section>`;
  }
  function routeDetail(journey) {
    if (!mapFrom && !mapTo) return '<p class="map-route-prompt">駅を2つ選ぶと、路線図上にルートを表示します。</p>';
    if (!journey) return `<div class="route-builder"><div><small>出発</small><strong>${escapeHtml(mapFrom || "駅を選択")}</strong></div><span>→</span><div><small>到着</small><strong>${escapeHtml(mapTo || "駅を選択")}</strong></div></div>${mapFrom === mapTo && mapFrom ? '<p class="map-search-hint">出発駅と異なる到着駅を選んでください。</p>' : ""}`;
    const names = Object.fromEntries(lines.map(l => [l.id,l.name.replace("（分岐線）", "支線")]));
    return `<div class="route-builder"><div><small>出発</small><strong>${escapeHtml(mapFrom)}</strong></div><span>→</span><div><small>到着</small><strong>${escapeHtml(mapTo)}</strong></div></div>
      <div class="route-metrics"><span><b>${journey.hops}</b>駅</span><span><b>${journey.transfers}</b>回乗換</span></div>
      <ol class="route-steps">${journey.segments.map((segment,i) => `<li style="--step-color:${lines.find(l => l.id === segment.lineId).color}"><span class="step-code">${segment.lineId === "Mb" ? "m" : segment.lineId}</span><div><b>${escapeHtml(names[segment.lineId])}</b><small>${escapeHtml(segment.from)} → ${escapeHtml(segment.to)} · ${segment.hops}駅</small></div></li>`).join("")}</ol>
      <p class="map-search-hint">駅数が少ない経路を表示。同名駅での乗換のみ計算し、点線の徒歩連絡・実際の乗換動線・所要時間・運賃は含みません。</p>`;
  }
  function miniMap() {
    if (!game?.goalStationId) return "";
    if (crossLine()) return `<section class="map-card network-trip"><div class="map-head"><b>路線をまたぐ旅路</b><span class="mini-label">${game.networkJourney.hops}駅 · 乗換${game.networkJourney.transfers}回</span></div>
      <div class="mini-route" aria-label="抽選された旅の経路">${game.routeStops.map((stop,i) => {
        const next = game.routeStops[i+1];
        const transfer = next && next.lineId !== stop.lineId;
        return `<div class="mini-node ${i === game.routeIndex ? "current" : ""} ${i === game.routeStops.length-1 ? "goal" : ""} ${i < game.routeIndex ? "past" : ""}" style="--node-color:${lineById(stop.lineId).color};--edge-color:${lineById(next?.lineId || stop.lineId).color}" title="${escapeHtml(stop.name)} · ${escapeHtml(lineById(stop.lineId).name)}"><i></i><b>${escapeHtml(stop.name)}</b><small>${stop.id}</small>${transfer ? '<em>乗換</em>' : ""}</div>`;
      }).join("")}</div><p class="route-note">「乗換」の駅で路線を変えます。乗換自体はサイコロの目に含みません。</p><button class="trip-map-button" data-action="map-trip">全路線図で経路を見る ↗</button></section>`;
    return `<section class="map-card"><div class="map-head"><b>${lineName()}の旅路</b><span class="mini-label">${line.id} · ${stations.length}駅</span></div>
      <div class="line-diagram-viewport">${metroMap.lineDiagram(line, game)}</div></section>`;
  }
  function mapScreen() {
    const focus = lines.find(item => item.id === mapFocusId);
    const code = item => item.id === "Mb" ? "m" : item.id;
    const journey = mapFrom && mapTo ? crossLine() && game.networkJourney &&
      mapFrom === game.networkJourney.from && mapTo === game.networkJourney.to
      ? game.networkJourney : metroMap.findRoute(mapFrom,mapTo) : null;
    return `<div class="fade-in"><span class="eyebrow">TOKYO METRO / SCHEMATIC</span>
      <h2 class="screen-title">駅から、旅を組み立てる。</h2>
      <p class="muted">駅を探して、出発駅と到着駅を選択。全9路線と方南町支線をまたぐルートを模式図で確かめられます。</p>
      <div class="map-search"><label for="map-search-input">駅を探す</label><div class="map-search-box"><span aria-hidden="true">⌕</span><input id="map-search-input" type="search" autocomplete="off" placeholder="例：渋谷、M06、北千住" value="${escapeHtml(mapSearchQuery)}" aria-controls="map-search-results"></div><div id="map-search-results" aria-live="polite">${searchResults()}</div></div>
      ${stationDetail(mapSelectedName)}
      ${journey ? `<div class="map-quick-summary"><span>${escapeHtml(mapFrom)} → ${escapeHtml(mapTo)}</span><b>${journey.hops}駅 · 乗換${journey.transfers}回</b></div>` : ""}
      <div class="map-filters" aria-label="表示する路線">
        <button class="map-chip ${!focus ? "active" : ""}" data-action="map-line" data-line="all" aria-pressed="${!focus}">全路線</button>
        ${lines.map(item => `<button class="map-chip ${mapFocusId === item.id ? "active" : ""}" data-action="map-line" data-line="${item.id}" aria-pressed="${mapFocusId === item.id}" style="--chip-color:${item.color}"><span>${code(item)}</span>${item.name.replace("（分岐線）", "支線")}</button>`).join("")}</div>
      <div class="map-controls"><span>スクロールで移動 · 駅をタップ</span><div><button data-action="map-zoom-out" aria-label="路線図を縮小" ${mapZoom <= .7 ? "disabled" : ""}>−</button><span aria-live="polite">${Math.round(mapZoom*100)}%</span><button data-action="map-zoom-in" aria-label="路線図を拡大" ${mapZoom >= 1.6 ? "disabled" : ""}>＋</button></div></div>
      <div class="network-viewport" aria-label="スクロールできる全路線図"><div class="map-canvas" style="width:${Math.round(1200*mapZoom)}px">${metroMap.overview({activeLineId:focus?.id,currentStationId:game && focus && game.lineId === focus.id ? game.currentStationId : null,goalStationId:game && focus && game.lineId === focus.id ? game.goalStationId : null,selectedStationName:mapSelectedName,journey})}</div></div>
      <p class="map-disclaimer">独自の模式図です。地理上の位置・距離・所要時間を示すものではありません。<a href="./metro-network.svg" target="_blank" rel="noopener noreferrer">SVGを大きく開く ↗</a></p>
      <section class="route-panel" aria-label="ルートプレビュー"><div class="route-panel-head"><div><span class="mini-label">ROUTE PREVIEW</span><h3>2駅間のルート</h3></div><div class="route-panel-actions"><button data-action="map-swap" ${!mapFrom || !mapTo ? "disabled" : ""} aria-label="出発駅と到着駅を入れ替える">入替</button><button data-action="map-clear" ${!mapFrom && !mapTo ? "disabled" : ""}>解除</button></div></div>${routeDetail(journey)}</section>
      ${focus ? `<section class="map-line-detail"><div class="line-key"><span class="line-pill" style="background:${focus.color}">${code(focus)}</span><h3>${focus.name.replace("（分岐線）", "（方南町支線）")}</h3></div>
        <p>${focus.stations[0].name} → ${focus.stations.at(-1).name} · ${focus.stations.length}駅</p>
        <div class="map-stop-list">${focus.stations.map(s => `<button data-action="map-station" data-station="${escapeHtml(s.name)}"><small>${s.id}</small>${escapeHtml(s.name)}</button>`).join("")}</div></section>` : ""}</div>`;
  }
  function questList() {
    const visit = game.visitHistory.at(-1);
    if (!visit) return "";
    const done = visit.quests.filter(q => q.completed).length;
    const canReroll = !done;
    return `<section class="panel quest-panel"><div class="quest-head"><div><span class="mini-label">STATION QUESTS / 任意で楽しむ</span>
      <h3>この駅で、ふたつの発見</h3></div><span class="quest-progress">${done} / 2</span></div>
      <p class="quest-intro">${visit.quests.every(q => q.category) ? "気が向いたものだけ。写真撮影や買い物は必要ありません。" : "気が向いたものだけ、自由に楽しめます。"}</p>
      ${visit.quests.map((q, i) => `<div class="quest ${q.completed ? "done" : ""}">
        <button data-action="quest" data-id="${escapeHtml(q.id)}" aria-label="クエスト${i + 1}を${q.completed ? "未達成に戻す" : "達成にする"}" aria-pressed="${q.completed}">${q.completed ? "✓" : ""}</button>
        <div><small>QUEST 0${i + 1} <span class="quest-kind">${escapeHtml(q.category || "街の発見")}</span></small><p>${escapeHtml(q.text)}</p></div>
      </div>`).join("")}
      ${canReroll ? '<button class="quest-reroll" data-action="reroll-quests">別の2つを選ぶ ↻</button>' : ""}</section>`;
  }
  function history() {
    return `<span class="eyebrow">YOUR JOURNEY</span><h2 class="screen-title">旅の記録</h2>
      <p class="muted">訪れた駅と、その街で選んだ発見を振り返れます。</p>
      <div class="panel"><div class="history-item"><span class="history-index">00</span><div><strong>${crossLine() ? escapeHtml(game.routeStops[0].name) : label(game.startStationId)}</strong><small>出発駅 · ${line.id}</small></div></div>
      ${game.visitHistory.map((v, i) => `<div class="history-entry"><div class="history-item"><span class="history-index">${String(i + 1).padStart(2, "0")}</span>
        <div><strong>${escapeHtml(v.stationName || label(v.stationId))}</strong><small>${v.isGoal ? "GOAL · " : ""}${v.lineId || game.lineId} · ${v.quests.filter(q => q.completed).length}/2 クエスト達成</small></div><em>⚄ ${v.diceValue}</em></div>
        <details class="history-quests"><summary>この駅のクエストを見る</summary><ul>${v.quests.map(q => `<li class="${q.completed ? "done" : ""}"><span>${q.completed ? "✓" : "○"}</span>${escapeHtml(q.text)}</li>`).join("")}</ul></details></div>`).join("")}
      </div>`;
  }
  function collectionScreen() {
    const visits = new Map(Object.entries(collection.visits).filter(([name,v]) =>
      metroMap.stations.has(name) && v && Array.isArray(v.lineIds) && Number.isFinite(v.count)));
    const count = visits.size, total = metroMap.stations.size;
    const arrivals = [...visits.values()].reduce((sum,v) => sum + v.count,0);
    const touchedLines = lines.filter(l => l.id !== "Mb" && l.stations.some(s =>
      visits.get(s.name)?.lineIds.includes(l.id) || l.id === "M" && visits.get(s.name)?.lineIds.includes("Mb"))).length;
    const routeRows = lines.map(l => {
      const reached = l.stations.filter(s => visits.get(s.name)?.lineIds.includes(l.id)).length;
      const percent = Math.round(reached / l.stations.length * 100);
      return `<button class="collection-line" data-action="collection-line" data-line="${l.id}" style="--collection-color:${l.color}">
        <span class="line-pill">${l.id === "Mb" ? "m" : l.id}</span><span class="collection-line-name"><b>${escapeHtml(l.name.replace("（分岐線）", "（方南町支線）"))}</b><span class="collection-line-bar"><i style="width:${percent}%"></i></span></span>
        <strong>${reached}<small> / ${l.stations.length}</small></strong></button>`;
    }).join("");
    const recent = [...visits.entries()].filter(([,v]) => Number.isFinite(Date.parse(v.lastAt)))
      .sort((a,b) => Date.parse(b[1].lastAt)-Date.parse(a[1].lastAt)).slice(0,5)
      .map(([name,v]) => `<div class="collection-visit"><span class="collection-visit-dot"></span><div><b>${escapeHtml(name)}</b><small>${new Date(v.lastAt).toLocaleDateString("ja-JP")} · ${v.count}回到着</small></div><span>↗</span></div>`).join("");
    return `<div class="fade-in collection-screen"><span class="eyebrow">YOUR METRO ATLAS</span>
      <h2 class="screen-title">訪れた駅が、旅の地図になる。</h2>
      <p class="muted">到着を確定した駅がここに残ります。位置情報は取得せず、この端末に保存します。</p>
      <section class="collection-hero"><span class="display-kicker">STATIONS DISCOVERED</span>
        <div class="collection-tally"><strong>${count}</strong><span> / ${total} 駅</span></div>
        <div class="collection-progress" role="progressbar" aria-label="駅図鑑の収集" aria-valuenow="${count}" aria-valuemin="0" aria-valuemax="${total}"><i style="width:${Math.round(count/total*100)}%"></i></div>
        <p>${count ? "次のひと駅で、地図を少しずつ広げよう。" : "最初のひと駅が、旅のコレクションの始まり。"}</p></section>
      <div class="collection-stats"><div><b>${arrivals}</b><span>到着記録</span></div><div><b>${collection.completedCount}</b><span>完走した旅</span></div><div><b>${touchedLines}</b><span>訪れた路線</span></div></div>
      <div class="collection-heading"><span class="mini-label">DISCOVER BY LINE</span><h3>路線ごとの発見</h3><p class="route-note">路線をタップすると、路線図で駅を探せます。</p></div>
      <div class="collection-lines">${routeRows}</div>
      ${recent ? `<div class="collection-heading"><span class="mini-label">RECENT ARRIVALS</span><h3>最近の到着</h3></div><div class="collection-recent">${recent}</div>` : ""}
      ${game?.visitHistory?.length ? '<button class="text-link collection-history" data-action="history">今回の旅の記録を見る →</button>' : ""}
      </div>`;
  }
  function sideMap() {
    if (lotteryPreview) return '<div class="rail-wait"><span class="rail-wait-symbol" aria-hidden="true">✦</span><b>駅を選んでいます</b><p>行き先が決まるまで、もう少し。</p></div>';
    if (!game?.lineId) return '<p class="route-note">出発路線を選ぶと、駅の並びがここに表示されます。</p>';
    if (crossLine() && game.routeStops) return game.routeStops.map((s,i) => {
      const transfer = i < game.routeStops.length-1 && s.lineId !== game.routeStops[i+1].lineId;
      const pending = game.gameState === "TRAVELING" && i === game.pendingIndex;
      return `<div class="rail-station ${i === game.routeIndex ? "current" : ""} ${i === game.routeStops.length-1 ? "goal" : ""} ${i < game.routeIndex ? "past" : ""} ${pending ? "pending" : ""}" style="--station-color:${lineById(s.lineId).color}">
        <span class="rail-dot"></span><span class="rail-code">${s.id}</span><span>${escapeHtml(s.name)}</span>${transfer ? '<span class="transfer-tag">乗換</span>' : ""}
        ${i === game.routeIndex ? '<span class="rail-tag">NOW</span>' : pending ? '<span class="rail-tag">NEXT</span>' : i === game.routeStops.length-1 ? '<span class="rail-tag">GOAL</span>' : ""}</div>`;
    }).join("");
    return stations.map((s, i) => {
      const at = game?.currentStationId ? byId(game.currentStationId) : -1;
      const past = game?.goalStationId && (game.direction > 0 ? i < at : i > at);
      const pending = game.gameState === "TRAVELING" && s.id === game.pendingStationId;
      return `<div class="rail-station ${s.id === game?.currentStationId ? "current" : ""} ${s.id === game?.goalStationId ? "goal" : ""} ${past ? "past" : ""} ${pending ? "pending" : ""}">
        <span class="rail-dot"></span><span class="rail-code">${s.id}</span><span>${s.name}</span>
        ${s.id === game?.currentStationId ? '<span class="rail-tag">NOW</span>' : pending ? '<span class="rail-tag">NEXT</span>' : s.id === game?.goalStationId ? '<span class="rail-tag">GOAL</span>' : ""}</div>`;
    }).join("");
  }
  function homeScreen() {
    const discovered = Object.keys(collection.visits).filter(name => metroMap.stations.has(name)).length;
    const tripStatus = game?.goalStationId ? game.gameState === "GOAL"
      ? `前回の旅　${escapeHtml(goalName())} に到着`
      : `旅の続き　${escapeHtml(currentName())} → ${escapeHtml(goalName())}`
      : "東京メトロ全9路線から、偶然のひと駅へ";
    return {
      body: `<section class="campaign-hero fade-in" aria-label="きまぐれメトロ旅">
        <picture class="campaign-art"><source media="(max-width:690px)" srcset="./metro-portal-portrait.webp"><img src="./metro-portal-landscape.webp" alt="地下鉄の扉の向こうに東京の街が広がり、足元にサイコロが置かれたイメージ" width="1774" height="887" decoding="async" fetchpriority="high"></picture>
        <div class="campaign-shade" aria-hidden="true"></div>
        <div class="campaign-copy">
          <span class="campaign-eyebrow"><i aria-hidden="true"></i> A SMALL TRIP, BY CHANCE</span>
          <h1>次の駅は、<br><strong>サイコロ次第。</strong></h1>
          <p class="campaign-lead">予定にない東京を、見つけよう。</p>
          <p class="campaign-description">今いる駅からでも、抽選からでも。ひと駅ずつ進むたび、知らなかった街に出会える。</p>
          <div class="campaign-path" aria-label="旅の流れ"><span>路線を選ぶ</span><i aria-hidden="true"></i><span>サイコロを振る</span><i aria-hidden="true"></i><span>街を発見</span></div>
          <div class="campaign-status"><span class="campaign-status-dot" aria-hidden="true"></span><span>${tripStatus}</span><b>${discovered} / ${metroMap.stations.size} 駅発見</b></div>
          ${restoreError ? '<p class="error">保存された旅を読み込めませんでした。新しい旅を始められます。</p>' : ""}
        </div>
        <button class="campaign-map-link" data-action="map" aria-label="東京メトロ全9路線のSVG路線図を見る"><span class="campaign-map-preview" aria-hidden="true">${metroMap.overview({preview:true})}</span><span class="campaign-map-label"><small>EXPLORE THE NETWORK</small><b>全9路線の路線図 <em>↗</em></b></span></button>
        <span class="campaign-network-count">09 LINES &nbsp;·&nbsp; ${metroMap.stations.size} STATIONS</span>
      </section>`,
      action: game ? '<button class="primary" data-action="resume">旅の続きへ　→</button>' : '<button class="primary" data-action="start">新しい旅をはじめる　→</button>'
    };
  }
  function setupProgress(state) {
    const stages = [
      ["MODE_SELECTION", "旅の形"], ["LINE_SELECTION", "路線"],
      ["START_LOTTERY", "出発駅"], ["GOAL_LOTTERY", "ゴール"]
    ];
    const current = stages.findIndex(([key]) => key === state);
    return `<nav class="setup-progress" aria-label="旅の準備の進行">
      <button class="setup-back" data-action="setup-back">← ${current === 0 ? "トップへ" : "ひとつ戻る"}</button>
      <ol>${stages.map(([key, label], index) => `<li class="${index < current ? "done" : index === current ? "active" : ""}" ${key === state ? 'aria-current="step"' : ""}><span>${String(index + 1).padStart(2, "0")}</span>${label}</li>`).join("")}</ol>
    </nav>`;
  }
  function screen() {
    if (view === "landing") return homeScreen();
    if (view === "map") return { body: mapScreen(), action: `<button class="primary" data-action="back">${mapReturnView === "collection" ? "駅図鑑に戻る" : mapReturnView === "landing" ? "トップへ戻る" : "旅の画面に戻る"}　→</button>` };
    if (view === "collection") return { body: collectionScreen(), action: game ? `<button class="primary" data-action="back">${collectionReturnView === "landing" ? "トップへ戻る" : collectionReturnView === "map" ? "路線図へ戻る" : "旅の画面に戻る"}　→</button>` : '<button class="primary" data-action="start">新しい旅をはじめる　→</button>' };
    if (view === "history" && game?.startStationId) return { body: history(), action: `<button class="primary" data-action="back">${historyReturnView === "collection" ? "駅図鑑に戻る" : "旅に戻る"}　→</button>` };
    if (lotteryPreview) return {
      body: `<div class="fade-in"><span class="eyebrow">STATION LOTTERY</span><h2 class="screen-title">${lotteryPreview.kind === "DESTINATION" ? "ゴール駅" : "出発駅"}を抽選中</h2>
        <div class="reel-machine is-spinning" role="status"><div class="reel-head"><span class="reel-led" aria-hidden="true"></span><span>${lotteryPreview.kind}</span><small>STATION SELECTOR</small></div>
        <div class="reel-window"><span class="reel-ghost" aria-hidden="true">············</span><div class="display-station ${displayStation === lotteryPreview.finalName ? "" : "reel-flash"}">${escapeHtml(displayStation || "？？？")}</div><span class="reel-ghost" aria-hidden="true">············</span></div>
        <div class="reel-foot"><span>${crossLine() && lotteryPreview.kind === "DESTINATION" ? "ALL 9 LINES" : lineName() + " · " + stations.length + "駅"}</span><span>✦</span></div></div></div>`,
      action: '<button class="primary" disabled>抽選中…</button>'
    };
    const state = game?.gameState || "HOME";
    if (state === "HOME") return homeScreen();
    if (state === "MODE_SELECTION") return {
      body: `<div class="fade-in">${setupProgress(state)}<span class="eyebrow">CHOOSE YOUR JOURNEY</span><h2 class="screen-title">今日は、どんな旅？</h2>
        <p class="muted">出発駅は抽選するか、今いる駅を選択。ゴール駅を抽選したら、サイコロで進みます。</p>
        <div class="mode-list"><button class="mode-card" data-action="select-mode" data-mode="single"><span class="mode-icon">Ⅰ</span><span class="mini-label">ONE LINE</span><strong>ひとつの路線で</strong><small>選んだ路線の駅を行き来。いつもの街を深掘り。</small><span class="mode-route" aria-hidden="true"><i></i><i></i><i></i><i></i></span><em>この旅を選ぶ →</em></button>
        <button class="mode-card network" data-action="select-mode" data-mode="network"><span class="mode-icon">↗</span><span class="mini-label">CROSS THE NETWORK</span><strong>路線をまたいで</strong><small>出発路線から乗換して、新しい街へ。駅数で進むルート旅。</small><span class="mode-route" aria-hidden="true"><i></i><i></i><i></i><i></i></span><em>この旅を選ぶ →</em></button></div>
        <p class="route-note">路線横断の経路は駅数優先の模式ルート。実際の乗換動線・時間・運賃は考慮しません。</p></div>`,
      action: '<span class="selection-hint">旅のモードを選んでください</span>'
    };
    if (state === "LINE_SELECTION") return {
      body: `<div class="fade-in">${setupProgress(state)}<span class="eyebrow">SELECT A LINE</span><h2 class="screen-title">${crossLine() ? "どの路線から、出発する？" : "今日は、どの路線？"}</h2>
        <p class="muted">${crossLine() ? "出発路線を選び、駅を抽選するか今いる駅を指定。ゴールは別の路線から抽選します。" : "東京メトロ全9路線と丸ノ内線の方南町支線。出発駅は抽選するか今いる駅を選べます。"}</p>
        <div class="line-list">${lines.map(item => `<button class="line-card" data-action="select-line" data-line="${item.id}" style="--line-color:${item.color}"><span class="line-pill">${item.id === "Mb" ? "m" : item.id}</span><span><strong>${item.name.replace("（分岐線）", "（方南町支線）")}</strong><small>${item.stations[0].name} — ${item.stations.at(-1).name} · ${item.stations.length}駅</small></span><span class="line-chevron">→</span></button>`).join("")}</div>
        <div class="panel"><span class="mini-label">HOW TO PLAY</span>
          <div class="feature-steps"><div><b>01</b>駅を抽選</div><div><b>02</b>サイコロで進む</div><div><b>03</b>到着して探索</div></div></div></div>`,
      action: '<span class="selection-hint">路線を選んで旅をはじめる</span>'
    };
    if (state === "START_LOTTERY" || state === "GOAL_LOTTERY") {
      const isStart = state === "START_LOTTERY";
      return {
        body: `<div class="fade-in">${setupProgress(state)}<span class="eyebrow">${isStart ? "START STATION" : "DESTINATION"}</span>
          <h2 class="screen-title">${isStart ? "出発駅を決めよう" : "ゴール駅を決めよう"}</h2>
          <p class="muted">${isStart ? lineName() + stations.length + "駅から抽選するか、今いる駅を選べます。" : "出発駅は " + label(game.startStationId) + "。旅の長さを選んで" + (crossLine() ? "別の路線の" : "") + "ゴールを抽選します。"}</p>
          <div class="reel-machine"><div class="reel-head"><span class="reel-led" aria-hidden="true"></span><span>${isStart ? "START STATION" : "DESTINATION"}</span><small>STATION SELECTOR</small></div>
            <div class="reel-window"><span class="reel-ghost" aria-hidden="true">············</span><div class="display-station">？？？</div><span class="reel-ghost" aria-hidden="true">············</span></div>
            <div class="reel-foot"><span>${crossLine() && !isStart ? "ALL 9 LINES / TRANSFER ROUTE" : lineName() + " · " + stations.length + "駅"}</span><span>✦</span></div></div>
          ${isStart ? `<details class="start-picker"><summary><span><b>今いる駅から始める</b><small>実際の出発駅を選択</small></span><span aria-hidden="true">＋</span></summary>
            <div class="start-station-list">${stations.map(s => `<button data-action="set-start" data-station="${s.id}"><small>${s.id}</small>${escapeHtml(s.name)}<span aria-hidden="true">→</span></button>`).join("")}</div></details>` :
            `<fieldset class="trip-distance"><legend>旅の長さを選ぶ</legend><div class="distance-options">
              <button data-action="set-distance" data-distance="short" aria-pressed="${game.distance === "short"}"><strong>近場でひと旅</strong><small>${crossLine() ? "3〜8駅を目安に乗換" : "1〜6駅の近場へ"}</small></button>
              <button data-action="set-distance" data-distance="free" aria-pressed="${game.distance !== "short"}"><strong>気ままに遠くへ</strong><small>${crossLine() ? "6〜16駅を目安に乗換" : "路線内の全駅から"}</small></button>
            </div></fieldset>`}
          <p class="route-note">抽選した駅はそのまま保存されます。ページを閉じても続きから再開できます。</p></div>`,
        action: `<button class="primary" data-action="${isStart ? "choose-start" : "choose-goal"}" ${busy ? "disabled" : ""}>${isStart ? "出発駅を抽選する" : "ゴール駅を抽選する"}　→</button>`
      };
    }
    if (state === "READY_TO_ROLL") return {
      body: `<div class="fade-in"><span class="eyebrow">THE JOURNEY</span><h2 class="screen-title">次は、どこまで？</h2>
        <section class="journey-board" aria-label="現在の旅"><div class="board-top"><span class="board-line"><i style="background:${line.color}"></i>${crossLine() ? "路線横断の旅" : lineName()}</span><span>TRIP / ${String(game.visitHistory.length+1).padStart(2,"0")}</span></div>
          <div class="trip-summary"><div class="trip-end"><span class="mini-label">現在地 / NOW</span><strong>${escapeHtml(currentName())}</strong></div>
          <span class="trip-arrow" aria-hidden="true">→</span><div class="trip-end"><span class="mini-label">行き先 / GOAL</span><strong>${escapeHtml(goalName())}</strong></div></div>
          <div class="board-progress"><div class="metric"><strong>${remaining()}</strong><span>駅でゴール</span></div><span class="board-pct">${pct()}%</span></div>
          <div class="progress-track" role="progressbar" aria-valuenow="${pct()}" aria-valuemin="0" aria-valuemax="100" aria-label="旅の進行"><span style="width:${pct()}%"></span></div>
          ${crossLine() ? `<div class="board-transfers">${game.networkJourney.hops}駅のルート · 乗換${game.networkJourney.transfers}回</div>` : ""}</section>
        <div class="dice-stage"><span class="dice-halo" aria-hidden="true"></span><span class="dice-glyph" aria-hidden="true">⚄</span><span class="dice-caption">ROLL THE DICE</span></div>
        ${miniMap()}<p class="route-note">サイコロを振ると、${crossLine() ? "保存したルートを駅数ぶん進みます。乗換は駅数に含みません" : "ゴール方向へ進みます"}。ゴールを越える目ならゴールで止まります。</p></div>`,
      action: '<button class="primary" data-action="roll"><span class="button-die" aria-hidden="true">⚄</span> サイコロを振る <span aria-hidden="true">→</span></button>'
    };
    if (state === "TRAVELING") return {
      body: `<div class="fade-in"><span class="eyebrow">NEXT STOP / ${game.pendingStationId}</span>
        <h2 class="screen-title">サイコロは ${game.lastDice}。</h2>
        <p class="muted">次の駅へ向かいましょう。着いたら到着を確定してください。</p>
        <section class="next-stop-board" aria-label="次の駅" style="--next-line-color:${crossLine() ? lineById(routeStop(game.pendingIndex).lineId).color : line.color}">
          <div class="next-stop-top"><span>${crossLine() ? escapeHtml(lineById(routeStop(game.pendingIndex).lineId).name) : lineName()}</span><span>${crossLine() ? game.pendingIndex-game.routeIndex : Math.abs(byId(game.pendingStationId)-byId(game.currentStationId))} 駅先</span></div>
          <div class="next-stop-main"><span>次の駅 / NEXT STOP</span><strong class="${busy ? "reel-flash" : ""}">${escapeHtml(displayStation || pendingName())}</strong>
            <span class="next-stop-die ${busy ? "rolling" : ""}" aria-label="サイコロの出目 ${game.lastDice}">${faces[(diceDisplay || game.lastDice) - 1]}</span></div>
          <div class="next-stop-foot"><span>現在地　${escapeHtml(currentName())}</span><span>→</span><span>${escapeHtml(pendingName())}</span></div>
        </section>
        <a class="arrival-map-link" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pendingName() + "駅 東京メトロ")}">Google マップで駅を確認 <span aria-hidden="true">↗</span></a>
        ${miniMap()}</div>`,
      action: `<button class="primary" data-action="arrive" ${busy ? "disabled" : ""}>到着した　→</button>`
    };
    if (state === "ARRIVED") return {
      body: `<div class="fade-in"><span class="eyebrow">ARRIVED / ${game.currentStationId}</span><h2 class="screen-title">ひと駅、発見。</h2>
        <div class="arrival-ticket" style="--ticket-line-color:${crossLine() ? lineById(routeStop(game.routeIndex).lineId).color : line.color}"><div class="ticket-row"><span>${crossLine() ? escapeHtml(lineById(routeStop(game.routeIndex).lineId).name) : lineName()}</span><span>STOP ${game.currentStationId}</span></div>
          <strong>${escapeHtml(currentName())}</strong><div class="ticket-row arrival-ticket-foot"><span>ゴールまで <b>${remaining()} 駅</b></span><span class="arrival-discovery">${collection.visits[currentName()]?.count === 1 ? "新しい駅を発見" : "もう一度この駅へ"} <b>${Object.keys(collection.visits).filter(name => metroMap.stations.has(name)).length} / ${metroMap.stations.size}</b></span></div></div>
        ${questList()}${miniMap()}<p class="route-note">クエストは任意です。ひとつも達成しなくても次へ進めます。</p></div>`,
      action: '<button class="primary" data-action="next">次のサイコロへ　→</button>'
    };
    if (state === "GOAL") return {
      body: `<div class="fade-in"><span class="eyebrow">JOURNEY COMPLETE</span><div class="celebrate">
        <span class="mini-label" style="color:#f7b951">GOAL / ${game.goalStationId}</span><div class="big">${escapeHtml(goalName())}</div>
        <p>${escapeHtml(crossLine() ? game.routeStops[0].name : label(game.startStationId))}から ${game.visitHistory.length} 回の到着。<br>今日だけの旅ができました。</p>
        <div class="goal-stamp"><span>${collection.visits[goalName()]?.count === 1 ? "新しい駅を発見" : "駅図鑑に記録"}</span><strong>${Object.keys(collection.visits).filter(name => metroMap.stations.has(name)).length}<small> / ${metroMap.stations.size} 駅</small></strong></div></div>
        ${questList()}<div class="list-head"><h3>旅の記録</h3><button class="text-link" data-action="history">すべて見る →</button></div>
        <div class="panel"><p class="muted" style="margin:0">訪問 ${game.visitHistory.length} 駅 · クエスト達成 ${game.visitHistory.flatMap(v => v.quests).filter(q => q.completed).length} 件</p></div>
        <div class="goal-actions"><button data-action="collection">駅図鑑で記録を見る ↗</button><button data-action="share">この旅をシェア ↗</button></div><p class="share-feedback" role="status" aria-live="polite"></p></div>`,
      action: '<button class="primary" data-action="restart">新しい旅をはじめる　→</button>'
    };
    return { body: '<p class="error">旅の状態を読み込めません。新しい旅を始めてください。</p>',
      action: '<button class="primary" data-action="clear">新しい旅をはじめる</button>' };
  }
  function render() {
    const oldScroll = view === "map" && app.querySelector(".network-viewport") ? app.querySelector("#screen")?.scrollTop : 0;
    const s = screen();
    const home = view === "landing" || view === "game" && !game;
    const canHistory = game?.startStationId && game.visitHistory.length > 0;
    const setup = !home && view !== "map" && !game?.lineId;
    const choice = view === "game" && ["MODE_SELECTION", "LINE_SELECTION"].includes(game?.gameState);
    const navIcons = {
      home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/></svg>',
      trip:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r=".8"/><circle cx="16" cy="8" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="8" cy="16" r=".8"/><circle cx="16" cy="16" r=".8"/></svg>',
      map:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/></svg>',
      atlas:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12a2 2 0 0 1 2 2v16H7a3 3 0 0 1-3-3V4a1 1 0 0 1 1-1zM7 21a3 3 0 0 1 0-6h12"/><path d="m11 8 1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/></svg>'
    };
    app.innerHTML = `<main class="shell ${home ? "home-shell" : view === "map" ? "map-shell" : "game-shell"}${setup ? " setup-shell" : ""}${choice ? " choice-shell" : ""}">
      <aside class="side side-left"><div class="brand"><span class="brand-mark">M</span>きまぐれメトロ旅</div>
        <div><span class="side-kicker">A SMALL TRIP, BY CHANCE</span><h1>次の駅は、<br><strong>サイコロ次第。</strong></h1>
          <p>今いる駅からでも、抽選からでも。ひと駅ずつ進むたび、街に新しい発見がある。</p></div>
        <div class="side-foot">東京メトロ全9路線で遊べます。<br>ログイン不要。進行はこの端末に保存されます。</div></aside>
      <section class="device" aria-label="旅の操作画面"><header class="app-top">
        <button class="app-logo app-home-link" data-action="home" aria-label="トップページへ"><span>${game?.lineId || "METRO"}</span>きまぐれメトロ旅</button>
        <div class="header-actions"><button class="icon-btn" data-action="${view === "map" ? "back" : "map"}">${view === "map" ? "戻る" : "路線図"}</button>
        <button class="icon-btn" data-action="${view === "collection" ? "back" : "collection"}">${view === "collection" ? "戻る" : "駅図鑑"}</button>
        ${canHistory ? `<button class="icon-btn" data-action="${view === "history" ? "back" : "history"}">${view === "history" ? "戻る" : "記録"}</button>` : ""}</div>
        </header><div class="app-body" id="screen" tabindex="-1" aria-live="polite">${s.body}</div>
        <footer class="action-area">${s.action}${!lotteryPreview && view === "game" && ["READY_TO_ROLL","TRAVELING","ARRIVED"].includes(game?.gameState) ? '<button class="text-link action-sub" data-action="restart">新しい旅をはじめる</button>' : ""}</footer>
        <nav class="mobile-nav" aria-label="主要メニュー">
          <button data-action="home" ${home ? 'aria-current="page"' : ""}>${navIcons.home}<span>ホーム</span></button>
          <button data-action="${game ? "resume" : "start"}" ${view === "game" && game ? 'aria-current="page"' : ""}>${navIcons.trip}<span>旅</span></button>
          <button data-action="${view === "map" ? "noop" : "map"}" ${view === "map" ? 'aria-current="page"' : ""}>${navIcons.map}<span>路線図</span></button>
          <button data-action="${view === "collection" ? "noop" : "collection"}" ${view === "collection" ? 'aria-current="page"' : ""}>${navIcons.atlas}<span>駅図鑑</span></button>
        </nav></section>
      <aside class="side side-right"><div><div class="line-key"><span class="line-pill">${!game?.lineId ? "?" : crossLine() && game.routeStops ? "↗" : line.id === "Mb" ? "m" : line.id}</span><h2>${!game?.lineId ? "旅の準備" : crossLine() && game.routeStops ? "路線横断の旅" : lineName()} <span class="mini-label">${!game?.lineId ? "路線を選択" : crossLine() && game.routeStops ? game.networkJourney.hops + "駅 · 乗換" + game.networkJourney.transfers + "回" : stations.length + "駅"}</span></h2></div>
        <div class="route-side" aria-label="${lotteryPreview ? "駅を抽選中" : !game?.lineId ? "出発路線を選択" : crossLine() && game.routeStops ? "乗換を含む旅の経路" : lineName() + "全" + stations.length + "駅"}">${sideMap()}</div></div>
        <p class="side-hint">● 現在地　● ゴール<br>途中でページを閉じても、次回続きから再開できます。</p></aside>
    </main>`;
    app.querySelector(".shell").style.setProperty("--line-color", crossLine() && game?.routeStops ? "#238f73" : line.color);
    if (oldScroll) app.querySelector("#screen").scrollTop = oldScroll;
    const viewport = app.querySelector(".network-viewport");
    if (viewport && Number.isFinite(viewport.scrollWidth)) {
      const focusLine = lines.find(item => item.id === mapFocusId);
      const at = focusLine && game?.lineId === focusLine.id ? focusLine.stations.findIndex(s => s.id === game?.currentStationId) : -1;
      const point = metroMap.stations.get(mapSelectedName)?.point || metroMap.stations.get(mapFrom)?.point ||
        (focusLine ? metroMap.routes.get(focusLine.id)[at >= 0 ? at : Math.floor(focusLine.stations.length / 2)] : metroMap.anchors["大手町"]);
      viewport.scrollLeft = point[0] / 1600 * viewport.scrollWidth - viewport.clientWidth / 2;
      viewport.scrollTop = point[1] / 1260 * viewport.scrollHeight - viewport.clientHeight / 2;
    }
  }
  function shareJourney() {
    if (game?.gameState !== "GOAL") return;
    const from = crossLine() ? game.routeStops[0].name : label(game.startStationId);
    const message = `きまぐれメトロ旅で、${from}から${goalName()}まで。${game.visitHistory.length}駅に到着した今日の旅。次はどこへ行こう？`;
    const url = location.origin + location.pathname;
    const feedback = value => { const el = app.querySelector(".share-feedback"); if (el) el.textContent = value; };
    if (navigator.share) navigator.share({title:"きまぐれメトロ旅",text:message,url})
      .catch(error => { if (error.name !== "AbortError") feedback("共有できませんでした。もう一度お試しください。"); });
    else if (navigator.clipboard?.writeText) navigator.clipboard.writeText(`${message}\n${url}`)
      .then(() => feedback("旅の紹介文とURLをコピーしました。"))
      .catch(() => feedback("コピーできませんでした。"));
    else if (typeof window.prompt === "function") window.prompt("旅の紹介文をコピー", `${message}\n${url}`);
  }
  app.addEventListener("click", e => {
    const button = e.target.closest("[data-action]");
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === "start") { saveNew(); return; }
    if (action === "home") { view = game ? "landing" : "game"; render(); app.querySelector("#screen")?.scrollTo(0,0); return; }
    if (action === "resume" && game) { view = "game"; render(); return; }
    if (action === "setup-back" && !busy && view === "game") {
      const state = game?.gameState;
      if (state === "MODE_SELECTION") { view = "landing"; render(); }
      else if (state === "LINE_SELECTION") save({travelMode:null,gameState:"MODE_SELECTION"});
      else if (state === "START_LOTTERY") save({lineId:null,gameState:"LINE_SELECTION"});
      else if (state === "GOAL_LOTTERY") save({startStationId:null,currentStationId:null,gameState:"START_LOTTERY"});
      app.querySelector("#screen")?.scrollTo(0,0);
      return;
    }
    if (action === "restart") {
      if (game && game.gameState !== "GOAL" && !confirm("進行中の旅を消して、新しい旅を始めますか？")) return;
      start(); return;
    }
    if (action === "clear") { reset(); return; }
    if (action === "select-mode") selectMode(button.dataset.mode);
    if (action === "set-start") setStart(button.dataset.station);
    if (action === "set-distance" && game?.gameState === "GOAL_LOTTERY" && ["short","free"].includes(button.dataset.distance)) save({distance:button.dataset.distance});
    if (action === "choose-start") chooseStart();
    if (action === "select-line") selectLine(button.dataset.line);
    if (action === "choose-goal") chooseGoal();
    if (action === "roll") roll();
    if (action === "arrive") arrive();
    if (action === "quest") toggleQuest(button.dataset.id);
    if (action === "reroll-quests") rerollQuests();
    if (action === "next" && game?.gameState === "ARRIVED") save({ gameState: "READY_TO_ROLL" });
    if (action === "collection") {
      if (view === "collection") view = collectionReturnView;
      else { collectionReturnView = view; view = "collection"; }
      render(); app.querySelector("#screen")?.scrollTo(0,0); return;
    }
    if (action === "collection-line" && view === "collection" && lines.some(l => l.id === button.dataset.line)) {
      mapReturnView = "collection"; mapFocusId = button.dataset.line; mapSelectedName = null;
      mapFrom = mapTo = null; view = "map"; render(); app.querySelector("#screen")?.scrollTo(0,0); return;
    }
    if (action === "share") { shareJourney(); return; }
    if (action === "map") { mapReturnView = view; mapFocusId = crossLine() && game?.routeStops ? null : game?.lineId || null; mapFrom = game?.currentStationId ? currentName() : null; mapTo = game?.goalStationId ? goalName() : null; view = "map"; render(); }
    if (action === "map-trip" && crossLine() && game.networkJourney) {
      mapReturnView = view; mapFocusId = null; mapSelectedName = null;
      mapFrom = game.networkJourney.from; mapTo = game.networkJourney.to;
      view = "map"; render();
    }
    if (action === "map-line" && view === "map") { mapFocusId = button.dataset.line === "all" ? null : button.dataset.line; render(); }
    if (action === "map-station" && view === "map" && metroMap.stations.has(button.dataset.station)) { mapSelectedName = button.dataset.station; mapSearchQuery = ""; render(); }
    if (action === "map-from" && view === "map") { mapFrom = button.dataset.station; render(); }
    if (action === "map-to" && view === "map") { mapTo = button.dataset.station; render(); }
    if (action === "map-swap" && view === "map" && mapFrom && mapTo) { [mapFrom,mapTo] = [mapTo,mapFrom]; render(); }
    if (action === "map-clear" && view === "map") { mapFrom = mapTo = null; render(); }
    if (action === "map-zoom-in" && view === "map") { mapZoom = Math.min(1.6,Math.round((mapZoom+.3)*10)/10); render(); }
    if (action === "map-zoom-out" && view === "map") { mapZoom = Math.max(.7,Math.round((mapZoom-.3)*10)/10); render(); }
    if (action === "history" && game) { historyReturnView = view; view = "history"; render(); }
    if (action === "back") { view = view === "map" ? mapReturnView : view === "history" ? historyReturnView : view === "collection" ? collectionReturnView : "game"; render(); }
    if (["select-mode","select-line","set-start","choose-start","choose-goal","roll","arrive","next","history","back","map","map-trip"].includes(action))
      app.querySelector("#screen")?.scrollTo(0, 0);
  });
  app.addEventListener("input", e => {
    if (view !== "map" || e.target.id !== "map-search-input") return;
    mapSearchQuery = e.target.value;
    const results = app.querySelector("#map-search-results");
    if (results) results.innerHTML = searchResults();
  });
  app.addEventListener("keydown", e => {
    if (view === "map" && e.target.matches?.(".network-station") && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault(); mapSelectedName = e.target.dataset.station; render();
    }
  });
  function saveNew() { start(); }
  render();
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
