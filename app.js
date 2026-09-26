(() => {
  "use strict";
  const KEY = "kimagure-metro-v1";
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
  let game = null;
  let view = "game";
  let mapFocusId = null;
  let busy = false;
  let lotteryPreview = null;
  let displayStation = null;
  let diceDisplay = null;
  let restoreError = false;

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.schemaVersion !== 1 || !saved.gameState || !setLine(saved.lineId) ||
          (saved.startStationId && byId(saved.startStationId) < 0) ||
          (saved.goalStationId && byId(saved.goalStationId) < 0) ||
          (saved.currentStationId && byId(saved.currentStationId) < 0) ||
          (saved.pendingStationId && byId(saved.pendingStationId) < 0)) throw Error("invalid save");
      game = saved;
    }
  } catch (e) { restoreError = true; game = null; }

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
      schemaVersion: 1, gameId: uuid(), gameState: "LINE_SELECTION",
      lineId: null, startStationId: null, goalStationId: null,
      currentStationId: null, pendingStationId: null,
      direction: 0, lastDice: null, visitHistory: [],
      updatedAt: new Date().toISOString()
    };
    view = "game";
    save({});
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
  function chooseGoal() {
    if (busy || game?.gameState !== "GOAL_LOTTERY") return;
    busy = true;
    const startIndex = byId(game.startStationId);
    const offset = 1 + random(stations.length - 1);
    const goal = stations[(startIndex + offset) % stations.length];
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
      displayStation = stations[random(stations.length)].name;
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
    const target = station(game.pendingStationId);
    const pool = [...target.quests];
    const quests = [];
    for (let i = 0; i < 2; i++) {
      const [q] = pool.splice(random(pool.length), 1);
      quests.push({ ...q, stationId: target.id, drawnAt: new Date().toISOString(), completed: false });
    }
    const isGoal = target.id === game.goalStationId;
    const visit = { visitId: uuid(), stationId: target.id, arrivedAt: new Date().toISOString(),
      diceValue: game.lastDice, quests, isGoal };
    save({
      currentStationId: target.id, pendingStationId: null,
      visitHistory: [...game.visitHistory, visit],
      gameState: isGoal ? "GOAL" : "ARRIVED"
    });
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
  const label = (id) => station(id)?.name || "—";
  const remaining = () => game?.goalStationId ? Math.abs(byId(game.goalStationId) - byId(game.currentStationId)) : 0;
  const pct = () => {
    if (!game?.goalStationId) return 0;
    const length = Math.abs(byId(game.goalStationId) - byId(game.startStationId));
    return Math.round((1 - remaining() / length) * 100);
  };
  function miniMap() {
    if (!game?.goalStationId) return "";
    return `<section class="map-card"><div class="map-head"><b>${lineName()}の旅路</b><span class="mini-label">${line.id} · ${stations.length}駅</span></div>
      <div class="line-diagram-viewport">${metroMap.lineDiagram(line, game)}</div></section>`;
  }
  function mapScreen() {
    const focus = lines.find(item => item.id === mapFocusId);
    const code = item => item.id === "Mb" ? "m" : item.id;
    return `<div class="fade-in"><span class="eyebrow">TOKYO METRO / SCHEMATIC</span>
      <h2 class="screen-title">路線図から、旅を見る。</h2>
      <p class="muted">全9路線と方南町支線の駅順・接続駅を描いた模式図です。路線を選ぶと強調表示します。</p>
      <div class="map-filters" aria-label="表示する路線">
        <button class="map-chip ${!focus ? "active" : ""}" data-action="map-line" data-line="all" aria-pressed="${!focus}">全路線</button>
        ${lines.map(item => `<button class="map-chip ${mapFocusId === item.id ? "active" : ""}" data-action="map-line" data-line="${item.id}" aria-pressed="${mapFocusId === item.id}" style="--chip-color:${item.color}"><span>${code(item)}</span>${item.name.replace("（分岐線）", "支線")}</button>`).join("")}</div>
      <div class="network-viewport" aria-label="スクロールできる全路線図">${metroMap.overview({activeLineId:focus?.id,currentStationId:game && focus && game.lineId === focus.id ? game.currentStationId : null,goalStationId:game && focus && game.lineId === focus.id ? game.goalStationId : null})}</div>
      <p class="map-disclaimer">独自の模式図です。地理上の位置・距離・所要時間を示すものではありません。<a href="./metro-network.svg" target="_blank" rel="noopener noreferrer">SVGを大きく開く ↗</a></p>
      ${focus ? `<section class="map-line-detail"><div class="line-key"><span class="line-pill" style="background:${focus.color}">${code(focus)}</span><h3>${focus.name.replace("（分岐線）", "（方南町支線）")}</h3></div>
        <p>${focus.stations[0].name} → ${focus.stations.at(-1).name} · ${focus.stations.length}駅</p>
        <div class="map-stop-list">${focus.stations.map(s => `<span><small>${s.id}</small>${s.name}</span>`).join("")}</div></section>` : ""}</div>`;
  }
  function questList() {
    const visit = game.visitHistory.at(-1);
    if (!visit) return "";
    return `<section class="panel"><span class="mini-label">STATION QUESTS / 任意で楽しむ</span>
      <h3 style="margin:9px 0 14px">この駅で、ふたつの発見</h3>
      ${visit.quests.map((q, i) => `<div class="quest ${q.completed ? "done" : ""}">
        <button data-action="quest" data-id="${q.id}" aria-label="クエスト${i + 1}を${q.completed ? "未達成に戻す" : "達成にする"}" aria-pressed="${q.completed}">${q.completed ? "✓" : ""}</button>
        <div><small>QUEST 0${i + 1}</small><p>${q.text}</p></div>
      </div>`).join("")}</section>`;
  }
  function history() {
    return `<span class="eyebrow">YOUR JOURNEY</span><h2 class="screen-title">旅の記録</h2>
      <p class="muted">訪れた駅と、サイコロの出目を振り返れます。</p>
      <div class="panel"><div class="history-item"><span class="history-index">00</span><div><strong>${label(game.startStationId)}</strong><small>出発駅</small></div></div>
      ${game.visitHistory.map((v, i) => `<div class="history-item"><span class="history-index">${String(i + 1).padStart(2, "0")}</span>
        <div><strong>${label(v.stationId)}</strong><small>${v.isGoal ? "GOAL · " : ""}${v.quests.filter(q => q.completed).length}/2 クエスト達成</small></div><em>⚄ ${v.diceValue}</em></div>`).join("")}
      </div>`;
  }
  function sideMap() {
    return stations.map((s, i) => {
      const at = game?.currentStationId ? byId(game.currentStationId) : -1;
      const past = game?.goalStationId && (game.direction > 0 ? i < at : i > at);
      return `<div class="rail-station ${s.id === game?.currentStationId ? "current" : ""} ${s.id === game?.goalStationId ? "goal" : ""} ${past ? "past" : ""}">
        <span class="rail-dot"></span><span class="rail-code">${s.id}</span><span>${s.name}</span>
        ${s.id === game?.currentStationId ? '<span class="rail-tag">NOW</span>' : s.id === game?.goalStationId ? '<span class="rail-tag">GOAL</span>' : ""}</div>`;
    }).join("");
  }
  function screen() {
    if (view === "map") return { body: mapScreen(), action: '<button class="primary" data-action="back">旅の画面に戻る　→</button>' };
    if (view === "history" && game?.startStationId) return { body: history(), action: '<button class="primary" data-action="back">旅に戻る</button>' };
    if (lotteryPreview) return {
      body: `<div class="fade-in"><span class="eyebrow">STATION LOTTERY</span><h2 class="screen-title">${lotteryPreview.kind === "DESTINATION" ? "ゴール駅" : "出発駅"}を抽選中</h2>
        <div class="panel-dark" role="status"><span class="display-kicker">${lotteryPreview.kind}</span>
        <div class="display-station ${displayStation === lotteryPreview.finalName ? "" : "reel-flash"}">${displayStation || "？？？"}</div>
        <span class="display-code">${lineName()} · ${stations.length}駅</span><div class="display-underline"></div></div></div>`,
      action: '<button class="primary" disabled>抽選中…</button>'
    };
    const state = game?.gameState || "HOME";
    if (state === "HOME") return {
      body: `<div class="fade-in"><span class="eyebrow">TOKYO METRO / ALL LINES</span><h2 class="screen-title">次の駅は、<br>サイコロ次第。</h2>
        <p class="muted">東京メトロ全9路線から、今日の旅を選ぼう。出発駅とゴールは運次第。</p>
        <button class="hero-map" data-action="map" aria-label="全路線のSVG路線図を見る">${metroMap.overview({preview:true})}
          <span class="hero-map-caption"><span>9 LINES / SVG MAP</span><strong>路線図を見る <b>↗</b></strong></span></button>
        <div class="feature-steps"><div><b>01</b>駅を抽選</div><div><b>02</b>サイコロで進む</div><div><b>03</b>街を発見</div></div>
        ${restoreError ? '<p class="error">保存された旅を読み込めませんでした。新しい旅を始められます。</p>' : ""}</div>`,
      action: '<button class="primary" data-action="start">新しい旅をはじめる　→</button>'
    };
    if (state === "LINE_SELECTION") return {
      body: `<div class="fade-in"><span class="eyebrow">SELECT A LINE</span><h2 class="screen-title">今日は、どの路線？</h2>
        <p class="muted">東京メトロ全9路線と丸ノ内線の方南町支線。路線を選んだら、出発駅とゴールを抽選します。</p>
        <div class="line-list">${lines.map(item => `<button class="line-card" data-action="select-line" data-line="${item.id}" style="--line-color:${item.color}"><span class="line-pill">${item.id === "Mb" ? "m" : item.id}</span><span><strong>${item.name.replace("（分岐線）", "（方南町支線）")}</strong><small>${item.stations[0].name} — ${item.stations.at(-1).name} · ${item.stations.length}駅</small></span><span class="line-chevron">→</span></button>`).join("")}</div>
        <div class="panel"><span class="mini-label">HOW TO PLAY</span>
          <div class="feature-steps"><div><b>01</b>駅を抽選</div><div><b>02</b>サイコロで進む</div><div><b>03</b>到着して探索</div></div></div></div>`,
      action: '<span class="selection-hint">路線を選んで旅をはじめる</span>'
    };
    if (state === "START_LOTTERY" || state === "GOAL_LOTTERY") {
      const isStart = state === "START_LOTTERY";
      return {
        body: `<div class="fade-in"><span class="eyebrow">STEP ${isStart ? "01" : "02"} / 02</span>
          <h2 class="screen-title">${isStart ? "出発駅を決めよう" : "ゴール駅を決めよう"}</h2>
          <p class="muted">${isStart ? lineName() + stations.length + "駅から、出発駅を抽選します。" : "出発駅は " + label(game.startStationId) + "。次はゴールを抽選します。"}</p>
          <div class="panel-dark"><span class="display-kicker">${isStart ? "START STATION" : "DESTINATION"}</span>
            <div class="display-station ${busy ? "reel-flash" : ""}">${displayStation || (isStart ? "？？？" : "？？？")}</div>
            <span class="display-code">${lineName()} · ${stations.length}駅</span><div class="display-underline"></div></div>
          <p class="route-note">抽選した駅はそのまま保存されます。ページを閉じても続きから再開できます。</p></div>`,
        action: `<button class="primary" data-action="${isStart ? "choose-start" : "choose-goal"}" ${busy ? "disabled" : ""}>${isStart ? "出発駅を抽選する" : "ゴール駅を抽選する"}　→</button>`
      };
    }
    if (state === "READY_TO_ROLL") return {
      body: `<div class="fade-in"><span class="eyebrow">THE JOURNEY</span><h2 class="screen-title">次は、どこまで？</h2>
        <div class="trip-summary"><div class="trip-end"><span class="mini-label">現在地</span><strong>${label(game.currentStationId)}</strong></div>
          <span class="trip-arrow">→</span><div class="trip-end"><span class="mini-label">GOAL</span><strong>${label(game.goalStationId)}</strong></div></div>
        <div class="metric"><strong>${remaining()}</strong><span>駅でゴール</span></div>
        <div class="progress-track" role="progressbar" aria-valuenow="${pct()}" aria-valuemin="0" aria-valuemax="100" aria-label="旅の進行"><span style="width:${pct()}%"></span></div>
        <div class="dice-stage"><span class="dice-glyph" aria-hidden="true">⚄</span></div>
        ${miniMap()}<p class="route-note">サイコロを振ると、ゴール方向へ進みます。ゴールを越える目ならゴールで止まります。</p></div>`,
      action: '<button class="primary" data-action="roll">サイコロを振る　→</button>'
    };
    if (state === "TRAVELING") return {
      body: `<div class="fade-in"><span class="eyebrow">NEXT STOP / ${game.pendingStationId}</span>
        <h2 class="screen-title">次は、${label(game.pendingStationId)}。</h2>
        <p class="muted">サイコロは ${game.lastDice}。駅に着いたら到着を確定してください。</p>
        <div class="panel-dark"><span class="display-kicker">ARRIVING AT</span><div class="display-station ${busy ? "reel-flash" : ""}">${displayStation || label(game.pendingStationId)}</div>
          <span class="display-code">CURRENT: ${label(game.currentStationId)}</span><div class="display-underline"></div></div>
        <div class="dice-stage ${busy ? "rolling" : ""}" style="margin:23px 0 35px"><span class="dice-glyph" style="width:90px;height:90px;font-size:5rem;border-radius:17px" aria-label="サイコロの出目 ${game.lastDice}">${faces[(diceDisplay || game.lastDice) - 1]}</span></div>
        ${miniMap()}
        <a class="secondary" style="display:block;text-align:center;text-decoration:none;margin-top:17px" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label(game.pendingStationId) + "駅 東京メトロ")}">Google マップで駅を確認 ↗</a></div>`,
      action: `<button class="primary" data-action="arrive" ${busy ? "disabled" : ""}>到着した　→</button>`
    };
    if (state === "ARRIVED") return {
      body: `<div class="fade-in"><span class="eyebrow">ARRIVED / ${game.currentStationId}</span><h2 class="screen-title">着きました。</h2>
        <div class="arrival-ticket"><div class="ticket-row"><span>${lineName()}</span><span>STOP ${game.currentStationId}</span></div>
          <strong>${label(game.currentStationId)}</strong><div class="ticket-row"><span>GOAL まで</span><span>${remaining()} 駅</span></div></div>
        ${questList()}${miniMap()}<p class="route-note">クエストは任意です。ひとつも達成しなくても次へ進めます。</p></div>`,
      action: '<button class="primary" data-action="next">次のサイコロへ　→</button>'
    };
    if (state === "GOAL") return {
      body: `<div class="fade-in"><span class="eyebrow">JOURNEY COMPLETE</span><div class="celebrate">
        <span class="mini-label" style="color:#f7b951">GOAL / ${game.goalStationId}</span><div class="big">${label(game.goalStationId)}</div>
        <p>${label(game.startStationId)}から ${game.visitHistory.length} 回の到着。<br>今日だけの旅ができました。</p></div>
        ${questList()}<div class="list-head"><h3>旅の記録</h3><button class="text-link" data-action="history">すべて見る →</button></div>
        <div class="panel"><p class="muted" style="margin:0">訪問 ${game.visitHistory.length} 駅 · クエスト達成 ${game.visitHistory.flatMap(v => v.quests).filter(q => q.completed).length} 件</p></div></div>`,
      action: '<button class="primary" data-action="restart">新しい旅をはじめる　→</button>'
    };
    return { body: '<p class="error">旅の状態を読み込めません。新しい旅を始めてください。</p>',
      action: '<button class="primary" data-action="clear">新しい旅をはじめる</button>' };
  }
  function render() {
    const s = screen();
    const canHistory = game?.startStationId && game.visitHistory.length > 0;
    app.innerHTML = `<main class="shell">
      <aside class="side side-left"><div class="brand"><span class="brand-mark">M</span>きまぐれメトロ旅</div>
        <div><span class="side-kicker">A SMALL TRIP, BY CHANCE</span><h1>次の駅は、<br><strong>サイコロ次第。</strong></h1>
          <p>出発駅も、ゴールも、今日の運次第。ひと駅ずつ進むたび、街に新しい発見がある。</p></div>
        <div class="side-foot">東京メトロ全9路線で遊べます。<br>ログイン不要。進行はこの端末に保存されます。</div></aside>
      <section class="device" aria-label="旅の操作画面"><header class="app-top">
        <div class="app-logo"><span>${game?.lineId || "METRO"}</span>きまぐれメトロ旅</div>
        <div class="header-actions"><button class="icon-btn" data-action="${view === "map" ? "back" : "map"}">${view === "map" ? "戻る" : "路線図"}</button>
        ${canHistory ? `<button class="icon-btn" data-action="${view === "history" ? "back" : "history"}">${view === "history" ? "戻る" : "記録"}</button>` : ""}</div>
        </header><div class="app-body" id="screen" tabindex="-1" aria-live="polite">${s.body}</div>
        <footer class="action-area">${s.action}${game && !["history","map"].includes(view) ? '<button class="text-link action-sub" data-action="restart">新しい旅をはじめる</button>' : ""}</footer></section>
      <aside class="side side-right"><div><div class="line-key"><span class="line-pill">${line.id === "Mb" ? "m" : line.id}</span><h2>${lineName()} <span class="mini-label">${stations.length}駅</span></h2></div>
        <div class="route-side" aria-label="${lineName()}全${stations.length}駅">${sideMap()}</div></div>
        <p class="side-hint">● 現在地　● ゴール<br>途中でページを閉じても、次回続きから再開できます。</p></aside>
    </main>`;
    app.querySelector(".shell").style.setProperty("--line-color", line.color);
    const viewport = app.querySelector(".network-viewport");
    if (viewport && Number.isFinite(viewport.scrollWidth)) {
      const focusLine = lines.find(item => item.id === mapFocusId);
      const at = focusLine && game?.lineId === focusLine.id ? focusLine.stations.findIndex(s => s.id === game?.currentStationId) : -1;
      const point = focusLine ? metroMap.routes.get(focusLine.id)[at >= 0 ? at : Math.floor(focusLine.stations.length / 2)] : metroMap.anchors["大手町"];
      viewport.scrollLeft = point[0] / 1600 * viewport.scrollWidth - viewport.clientWidth / 2;
      viewport.scrollTop = point[1] / 1260 * viewport.scrollHeight - viewport.clientHeight / 2;
    }
  }
  app.addEventListener("click", e => {
    const button = e.target.closest("[data-action]");
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === "start") { saveNew(); return; }
    if (action === "restart") {
      if (game && game.gameState !== "GOAL" && !confirm("進行中の旅を消して、新しい旅を始めますか？")) return;
      start(); return;
    }
    if (action === "clear") { reset(); return; }
    if (action === "choose-start") chooseStart();
    if (action === "select-line") selectLine(button.dataset.line);
    if (action === "choose-goal") chooseGoal();
    if (action === "roll") roll();
    if (action === "arrive") arrive();
    if (action === "quest") toggleQuest(button.dataset.id);
    if (action === "next" && game?.gameState === "ARRIVED") save({ gameState: "READY_TO_ROLL" });
    if (action === "map") { mapFocusId = game?.lineId || null; view = "map"; render(); }
    if (action === "map-line" && view === "map") { mapFocusId = button.dataset.line === "all" ? null : button.dataset.line; render(); }
    if (action === "history" && game) { view = "history"; render(); }
    if (action === "back") { view = "game"; render(); }
    if (["select-line","choose-start","choose-goal","roll","arrive","next","history","back","map"].includes(action))
      app.querySelector("#screen")?.scrollTo(0, 0);
  });
  function saveNew() { start(); }
  render();
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
