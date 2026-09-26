// Regenerate the standalone SVG after editing data.js or metro-map.js.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = { window: {} };
vm.createContext(context);
for (const filename of ["data.js", "metro-map.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, filename), "utf8"), context);
}
const style = `<style>
.network-route{fill:none;stroke-linecap:round;stroke-linejoin:round}
.route-casing{stroke:#f7f8f3;stroke-width:15}
.route-color{stroke-width:8;fill:none}
.network-station circle{fill:#fff;stroke:#34534e;stroke-width:2}
.transfer-walk{fill:none;stroke:#7b918c;stroke-width:5;stroke-dasharray:5 7;stroke-linecap:round;opacity:.65}
.network-label{font:700 19px sans-serif;fill:#193c37;paint-order:stroke;stroke:#f7f8f3;stroke-width:5;stroke-linejoin:round}
.network-legend .legend-heading{font:700 16px monospace;letter-spacing:2px;fill:#6c8580}
.network-legend .legend-code{font:700 18px monospace;fill:#fff}
.network-legend .legend-name{font:700 17px sans-serif;fill:#23413c}
.network-legend .legend-note{font:500 15px sans-serif;fill:#728984}
</style>`;
const svg = context.window.METRO_MAP.overview().replace(
  "<title>きまぐれメトロ旅 路線図</title>",
  "<title>きまぐれメトロ旅 路線図</title><desc>東京メトロ9路線と丸ノ内線方南町支線の駅順・主要駅の接続を描いた独自の模式図。地理上の位置や距離は示しません。</desc>" + style
);
fs.writeFileSync(path.join(root, "metro-network.svg"), svg + "\n");
