#!/usr/bin/env node
// Снимает полосу игры в PNG. Нужен потому, что по коду не видно, как оно выглядит:
// оба дефекта интерфейса в прошлый раз нашёл человек глазами, а не тесты.
//
//   node tools/shot.mjs proto/prototype.html out.png [ключи]
//
// Ключи:
//   --mode road|town     режим (по умолчанию road)
//   --dist 900           где стоит странник — задаёт биом
//   --time 0.30          время суток: 0 полночь, .25 рассвет, .5 полдень, .75 закат
//   --weather clear|rain|fog|snow
//   --state walk|fight|tele|dead
//   --gear                надеть полный комплект
//   --bld 4               уровень всех построек (лагерь растёт вместе с ними)
//   --pix 2               зерно пикселя
//   --w 1180              ширина окна
//   --wait 900            сколько мс покрутить симуляцию перед снимком
//   --wayf                поставить рядом всех путников (иначе ждать их долго)
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";

// playwright может стоять глобально, а не в проекте — ищем оба варианта
async function loadPlaywright() {
  try { return await import("playwright"); } catch (e) {}
  try {
    const root = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
  } catch (e) {
    console.error("playwright не найден. Поставь: npm i -D playwright");
    process.exit(2);
  }
}
const { chromium } = await loadPlaywright();

const args = process.argv.slice(2);
const file = args[0] || "proto/prototype.html";
const out = args[1] || "shot.png";
const opt = (k, d) => {
  const i = args.indexOf("--" + k);
  return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true);
};

const cfg = {
  mode: opt("mode", "road"),
  dist: Number(opt("dist", 900)),
  time: Number(opt("time", 0.34)),
  weather: opt("weather", "clear"),
  state: opt("state", "walk"),
  gear: !!opt("gear", false),
  bld: Number(opt("bld", 0)),
  pix: Number(opt("pix", 2)),
  width: Number(opt("w", 1180)),
  wait: Number(opt("wait", 900)),
  wayf: !!opt("wayf", false),
};

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({
  viewport: { width: cfg.width, height: 900 },
  deviceScaleFactor: 2,
});

const errs = [];
page.on("pageerror", e => errs.push(String(e)));
page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });

await page.goto("file://" + path.resolve(file));
// сейв прошлого прогона сбил бы состояние — начинаем с чистого
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.reload();
await page.waitForTimeout(200);

await page.evaluate(c => {
  const s = window.sim;
  if (!s) throw new Error("window.sim не найден — прототип не отдаёт состояние наружу");
  if (c.bld > 0) for (const id in s.bld) s.bld[id] = c.bld;
  if (c.gear) {
    for (const slot of window.SLOTS) s.armory[slot] = window.makeItem(slot, 3);
  }
  s.time = c.time;
  s.weather = c.weather;
  s.mode = c.mode;
  if (c.mode === "road") {
    s.contract = s.board[0];
    s.contract.dist = c.dist + 400;
    s.deadline = s.day + 9;
    s.depart();
    s.k.dist = c.dist;
    s.k.food = s.foodMax;
    if (c.state === "fight" || c.state === "tele") {
      s.startWave(false);
      if (c.state === "fight") s.engage();
    } else if (c.state === "dead") {
      s.k.state = "dead"; s.k.timer = 3;
    }
  }
  if (window.setPix) window.setPix(c.pix);
  window.__shotFreeze = c.state === "fight" || c.state === "tele" || c.state === "dead";
}, cfg);

await page.waitForTimeout(cfg.wait);
// бой кончается быстрее, чем успевает отработать ожидание, поэтому сцену
// пересобираем прямо перед снимком и останавливаем цикл
if (cfg.state === "fight" || cfg.state === "tele") await page.click("#pause");
await page.evaluate(c => {
  const s = window.sim;
  s.time = c.time; s.weather = c.weather;
  if (c.mode !== "road") return;
  if (c.state === "walk" && s.k.state !== "dead") { s.k.state = "walk"; s.wave = []; }
  if (c.state === "fight" || c.state === "tele") {
    s.k.dist = c.dist; s.k.hp = s.hpMax;
    s.startWave(false);
    if (c.state === "fight") { s.engage(); s.k.state = "fight"; }
    s.floats.length = 0;
  }
  if (c.wayf) {
    s.travellers.length = 0;
    const kinds = ["pedlar","pilgrim","refugee","merc","cart","herald","monk"];
    kinds.forEach((k, i) => {
      const t = window.rollWayf(s, s.k.dist, s.k.dist);
      t.k = k; t.met = true; t.dir = i % 2 ? 1 : -1;
      t.x = s.k.dist - 150 + i * 46;
      s.travellers.push(t);
    });
  }
}, cfg);
await page.waitForTimeout(160);

fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
const strip = await page.$(".strip");
await strip.screenshot({ path: out });

await browser.close();
if (errs.length) {
  console.log("ошибки страницы:");
  for (const e of errs.slice(0, 6)) console.log("  " + e);
}
console.log(`${out}  ${cfg.mode}/${cfg.state} шаг ${cfg.dist} время ${cfg.time} ${cfg.weather}${errs.length ? "  ⚠ с ошибками" : ""}`);
process.exit(errs.length ? 1 : 0);
