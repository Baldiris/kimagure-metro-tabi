const fs = require('fs'), vm = require('vm'), assert = require('assert');
const data = fs.readFileSync(__dirname + '/data.js', 'utf8');
const quests = fs.readFileSync(__dirname + '/quest-data.js', 'utf8');
const map = fs.readFileSync(__dirname + '/metro-map.js', 'utf8');
const code = fs.readFileSync(__dirname + '/app.js', 'utf8');
function session(seed = [], initial = null) {
  const storage = new Map(typeof initial === 'string' ? [['kimagure-metro-v1',initial]] : Object.entries(initial || {}));
  let handlers = {}, html = '', shareCalls = [];
  const app = {set innerHTML(v) { html = v; }, get innerHTML() { return html; }, addEventListener(type, fn) { handlers[type] = fn; }, querySelector() { return {scrollTo() {}, style: {setProperty() {}}}; }};
  const ctx = {window: {}, document: {getElementById() { return app; }}, crypto: {randomUUID: () => 'uuid', getRandomValues(a) { a[0] = seed.shift() ?? 0; return a; }},
    localStorage: {getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key,value); }, removeItem(key) { storage.delete(key); }},
    navigator:{share(payload) { shareCalls.push(payload); return Promise.resolve(); }},location:{origin:'https://example.com',pathname:'/metro/'},
    matchMedia() { return {matches: true}; }, confirm() { return true; }, Date, Math, console, encodeURIComponent};
  vm.createContext(ctx); vm.runInContext(data, ctx); vm.runInContext(quests, ctx); vm.runInContext(map, ctx); vm.runInContext(code, ctx);
  return {click(action, line, id, station, mode, distance) { handlers.click({target: {closest() { return {dataset: {action, line, id, station, mode, distance}, disabled: false}; }}}); },
    get game() { const raw = storage.get('kimagure-metro-v1'); return raw && JSON.parse(raw); },
    get collection() { const raw = storage.get('kimagure-metro-collection-v1'); return raw && JSON.parse(raw); },
    get html() { return html; }, get raw() { return storage.get('kimagure-metro-v1'); },
    get allRaw() { return Object.fromEntries(storage); }, get shareCalls() { return shareCalls; },
    lines: ctx.window.METRO_DATA.lines, metroMap: ctx.window.METRO_MAP};
}
const first = session();
assert.equal(first.lines.length, 10);
assert.equal(new Set(first.lines.map(line => line.id)).size, 10);
const everyStation = first.lines.flatMap(line => line.stations);
assert.equal(new Set(everyStation.map(s=>s.name)).size, 144);
assert(everyStation.every(s=>s.quests.length===8 &&
  s.quests.filter(q=>q.category==='街の手がかり').length===2 &&
  s.quests.filter(q=>q.category==='小さな寄り道').length===6 &&
  s.quests.every(q=>!q.text.includes('写真') && !q.text.includes('購入'))));
assert(first.html.includes('class="shell home-shell"'));
assert(first.html.includes('class="network-svg is-preview"'));
assert(first.html.includes('src="./metro-portal-landscape.webp"'));
assert(first.html.includes('srcset="./metro-portal-portrait.webp"'));
first.click('map'); assert(first.html.includes('class="network-viewport"'));
first.click('map-line', 'H'); assert(first.html.includes('data-route="H"'));
first.click('map-station', undefined, undefined, '渋谷'); assert(first.html.includes('SELECTED STATION'));
first.click('map-from', undefined, undefined, '渋谷');
first.click('map-to', undefined, undefined, '浅草');
assert(first.html.includes('route-metrics') && first.html.includes('journey-path'));
const result = first.metroMap.findRoute('渋谷','浅草');
assert.equal(result.from, '渋谷'); assert.equal(result.to, '浅草');
assert(result.hops > 0 && result.hops <= 18);
assert.equal(result.segments[0].from, '渋谷'); assert.equal(result.segments.at(-1).to, '浅草');
assert.equal(first.metroMap.findRoute('中野坂上','方南町').hops, 3);
assert(first.metroMap.findRoute('新木場','北綾瀬').transfers > 0);
first.click('map-swap'); assert(first.html.includes('<strong>浅草</strong>'));
first.click('map-clear'); assert(!first.html.includes('journey-path'));
first.click('back'); assert(first.html.includes('data-action="start"'));
const selection = session(); selection.click('start');
const selectionReloaded = session([], selection.raw);
assert.equal(selectionReloaded.game.gameState, 'MODE_SELECTION');
assert(selectionReloaded.html.includes('data-action="resume"'));
selectionReloaded.click('resume'); assert(selectionReloaded.html.includes('CHOOSE YOUR JOURNEY'));
selectionReloaded.click('select-mode', undefined, undefined, undefined, 'single');
assert(selectionReloaded.html.includes('SELECT A LINE'));
selectionReloaded.click('home'); assert(selectionReloaded.html.includes('class="shell home-shell"'));
const nearby = session([0,0,0]);
nearby.click('start'); nearby.click('select-mode', undefined, undefined, undefined, 'single'); nearby.click('select-line','G');
assert(nearby.html.includes('今いる駅から始める'));
nearby.click('set-start', undefined, undefined, 'G10');
assert.equal(nearby.game.startStationId,'G10');
assert(nearby.html.includes('旅の長さを選ぶ') && nearby.html.includes('aria-pressed="true"'));
nearby.click('choose-goal');
const nearStart = nearby.lines[0].stations.findIndex(s=>s.id==='G10');
const nearGoal = nearby.lines[0].stations.findIndex(s=>s.id===nearby.game.goalStationId);
assert(Math.abs(nearStart-nearGoal) >= 1 && Math.abs(nearStart-nearGoal) <= 6);
const closeNetwork = session([0]);
closeNetwork.click('start'); closeNetwork.click('select-mode',undefined,undefined,undefined,'network'); closeNetwork.click('select-line','G');
closeNetwork.click('set-start',undefined,undefined,'G10'); closeNetwork.click('choose-goal');
assert(closeNetwork.game.networkJourney.transfers >= 1);
assert(closeNetwork.game.networkJourney.hops <= 8);
for (const line of first.lines) {
  const s = session([0, 2, 5, 0, 1]);
  s.click('start'); s.click('select-mode', undefined, undefined, undefined, 'single');
  assert(s.html.includes('data-line="' + line.id + '"'));
  assert(!s.html.includes('class="shell home-shell"'));
  s.click('select-line', line.id); assert.equal(s.game.lineId, line.id);
  s.click('choose-start'); assert.equal(s.game.startStationId, line.stations[0].id);
  s.click('set-distance', undefined, undefined, undefined, undefined, 'free');
  s.click('choose-goal'); assert.equal(s.game.goalStationId, line.stations[3].id);
  assert(s.html.includes('class="line-svg"'));
  s.click('map'); assert(s.html.includes('network-marker now') && s.html.includes('network-marker goal'));
  s.click('back'); assert.equal(s.game.gameState, 'READY_TO_ROLL');
  s.click('roll'); assert.equal(s.game.currentStationId, line.stations[0].id);
  assert.equal(s.game.pendingStationId, line.stations[3].id);
  const restored = session([], s.raw); assert.equal(restored.game.lineId, line.id);
  assert(restored.html.includes('data-action="resume"'));
  restored.click('resume'); assert(restored.html.includes('data-action="arrive"'));
  restored.click('arrive'); assert.equal(restored.game.gameState, 'GOAL');
  assert.equal(restored.collection.completedCount, 1);
  assert.equal(restored.collection.visits[line.stations[3].name].count, 1);
  assert.equal(session([],restored.raw).collection.completedCount, 1); // Older saved trips enter the new collection.
  assert.equal(restored.game.visitHistory[0].quests.length, 2);
  assert.deepEqual(restored.game.visitHistory[0].quests.map(q=>q.category), ['街の手がかり','小さな寄り道']);
  assert(restored.html.includes('別の2つを選ぶ'));
  const firstQuestIds = restored.game.visitHistory[0].quests.map(q=>q.id);
  restored.click('reroll-quests');
  assert(restored.game.visitHistory[0].quests.every(q=>!firstQuestIds.includes(q.id)));
  assert(restored.html.includes('別の2つを選ぶ'));
  const quest = restored.game.visitHistory[0].quests[0].id;
  restored.click('quest', undefined, quest);
  assert.equal(session([], restored.raw).game.visitHistory[0].quests[0].completed, true);
  assert(!restored.html.includes('別の2つを選ぶ'));
  const completedQuestIds = restored.game.visitHistory[0].quests.map(q=>q.id);
  restored.click('reroll-quests');
  assert.deepEqual(restored.game.visitHistory[0].quests.map(q=>q.id),completedQuestIds);
  restored.click('history'); assert(restored.html.includes('この駅のクエストを見る'));
  restored.click('back'); restored.click('collection');
  assert(restored.html.includes('YOUR METRO ATLAS') && restored.html.includes('完走した旅'));
  restored.click('collection-line', line.id); assert(restored.html.includes('class="shell map-shell"'));
  restored.click('back'); assert(restored.html.includes('YOUR METRO ATLAS'));
  restored.click('back'); restored.click('share'); assert.equal(restored.shareCalls.length, 1);
  assert(restored.shareCalls[0].text.includes(line.stations[3].name));
  restored.click('restart'); assert.equal(restored.collection.completedCount, 1);
  assert.equal(session([],restored.allRaw).collection.completedCount, 1);
  const reverse = session([line.stations.length - 1, 0, 0, 0, 1]);
  reverse.click('start'); reverse.click('select-mode', undefined, undefined, undefined, 'single'); reverse.click('select-line', line.id);
  reverse.click('choose-start'); reverse.click('set-distance', undefined, undefined, undefined, undefined, 'free'); reverse.click('choose-goal');
  assert.equal(reverse.game.direction, -1); reverse.click('roll');
  assert.equal(reverse.game.pendingStationId, line.stations.at(-2).id);
}
for (const line of first.lines) {
  const s = session([0]);
  s.click('start'); s.click('select-mode', undefined, undefined, undefined, 'network');
  s.click('select-line', line.id); s.click('choose-start'); s.click('set-distance', undefined, undefined, undefined, undefined, 'free'); s.click('choose-goal');
  assert.equal(s.game.travelMode, 'network');
  assert.equal(s.game.networkJourney.transfers >= 1, true, line.id);
  assert.equal(s.game.routeStops.length - 1, s.game.networkJourney.hops);
  assert(!line.stations.some(stop => stop.name === s.game.routeStops.at(-1).name));
  assert(s.html.includes('class="map-card network-trip"'));
  s.click('map-trip'); assert(s.html.includes('journey-path') && s.html.includes('route-metrics'));
  s.click('back');
  let movedAcrossLines = false, rolls = 0;
  while (s.game.gameState !== 'GOAL' && rolls++ < 25) {
    if (s.game.gameState === 'ARRIVED') s.click('next');
    const before = s.game.routeIndex;
    s.click('roll');
    assert.equal(s.game.routeIndex, before);
    assert.equal(s.game.pendingIndex, Math.min(before + s.game.lastDice, s.game.routeStops.length - 1));
    const restored = session([], s.raw);
    assert.equal(restored.game.gameState, 'TRAVELING');
    restored.click('resume'); assert(restored.html.includes('data-action="arrive"'));
    s.click('arrive');
    assert.equal(s.game.routeIndex, Math.min(before + s.game.lastDice, s.game.routeStops.length - 1));
    const visit = s.game.visitHistory.at(-1);
    assert.equal(visit.stationName, s.game.routeStops[s.game.routeIndex].name);
    assert.equal(visit.quests.length, 2);
    if (visit.lineId !== line.id) movedAcrossLines = true;
  }
  assert.equal(s.game.gameState, 'GOAL', line.id);
  assert(movedAcrossLines, line.id);
  assert.equal(s.game.routeIndex, s.game.routeStops.length - 1);
  const finish = session([], s.raw); finish.click('resume');
  assert(finish.html.includes('JOURNEY COMPLETE'));
}
console.log('OK: 20 journeys, actual-station departure, short trips, persistent collection, sharing, map, reload and quests');
