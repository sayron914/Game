#!/usr/bin/env node
// Прогоняет отрисовку через подставной canvas и ловит то, что не видно глазом:
// NaN в координатах, битые цвета, утечки состояния, просадки по числу операций.
import fs from "fs";
import vm from "vm";

const file = process.argv[2] || "/mnt/user-data/outputs/knight-order-prototype.html";
const FRAMES = Number(process.argv[3] || 600);

const errs = [];
let ops = 0, maxOps = 0;
const bad = v => typeof v === "string" && (v.includes("NaN") || v.includes("undefined"));

function mkCtx() {
  const c = {
    _f: "#000", _s: "#000", globalAlpha: 1, lineWidth: 1,
    font: "", textAlign: "", imageSmoothingEnabled: false,
    set fillStyle(v) { if (bad(v)) errs.push("fillStyle " + v); this._f = v; },
    get fillStyle() { return this._f; },
    set strokeStyle(v) { if (bad(v)) errs.push("strokeStyle " + v); this._s = v; },
    get strokeStyle() { return this._s; },
  };
  const geo = ["fillRect","clearRect","moveTo","lineTo","arc","translate","scale",
               "rotate","setTransform","drawImage","strokeRect","putImageData",
               "rect","ellipse","quadraticCurveTo","bezierCurveTo","clip"];
  for (const m of geo) c[m] = (...a) => {
    ops++;
    for (const v of a) if (typeof v === "number" && !isFinite(v)) errs.push(`${m}: NaN`);
  };
  for (const m of ["beginPath","closePath","fill","stroke","save","restore"]) c[m] = () => { ops++; };
  c.fillText = (t, x, y) => { ops++; if (!isFinite(x) || !isFinite(y)) errs.push("fillText: NaN"); };
  c.measureText = () => ({ width: 40 });
  c.createImageData = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
  // цветокоррекция читает кадр обратно — без этого движок падает на первом же кадре
  c.getImageData = (x, y, w, h) => {
    ops++;
    if (![x, y, w, h].every(Number.isFinite)) errs.push("getImageData: NaN");
    return { width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) };
  };
  const grad = () => ({ addColorStop: (o, col) => { if (bad(col)) errs.push("gradient " + col); } });
  c.createLinearGradient = grad;
  c.createRadialGradient = grad;
  c.createPattern = () => null;
  return c;
}
const els = {};
function mkEl(id) {
  if (els[id]) return els[id];
  const e = { id, style: {}, classList: { toggle(){}, add(){}, remove(){} },
    width: 900, height: 250, _rebuilds: 0, appendChild(){}, prepend(){},
    textContent: "", children: { length: 0 }, addEventListener(){},
    disabled: false, title: "", onclick: null,
    getContext: () => mkCtx(), getBoundingClientRect: () => ({ width: 900, left: 0 }) };
  let hv = "";
  Object.defineProperty(e, "innerHTML", { set(v) { if (v === "") e._rebuilds++; hv = v; }, get() { return hv; } });
  els[id] = e; return e;
}
const html = fs.readFileSync(file, "utf8");
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const g = { console, performance: { now: () => Date.now() },
  requestAnimationFrame: () => {}, addEventListener() {}, confirm: () => false, prompt: () => null,
  setInterval() {}, setTimeout() {}, clearTimeout() {},
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  document: { getElementById: mkEl, createElement: () => mkEl("t" + Math.random()), querySelectorAll: () => [] } };
vm.createContext(g);
vm.runInContext(src + "\nglobalThis.__t={sim,render,camX,ui,fit,tickKeep};", g);
const t = g.__t;
t.fit();

const opsPerFrame = [];
for (let i = 0; i < FRAMES; i++) {
  ops = 0;
  t.sim.tick(0.016);
  if (t.sim.k.state === "decide") t.sim.decide(true);
  if (t.sim.mode === "town" && !t.sim.contract) t.sim.takeContract(0);
  if (t.sim.mode === "town" && t.sim.contract && !t.sim.pending) t.sim.depart();
  t.tickKeep(0.016, t.sim);
  t.render(t.sim, t.camX());
  t.ui();
  opsPerFrame.push(ops);
  maxOps = Math.max(maxOps, ops);
}
opsPerFrame.sort((a, b) => a - b);
const p = q => opsPerFrame[Math.floor(opsPerFrame.length * q)];

console.log(`\n=== ОТРИСОВКА, ${FRAMES} кадров ===`);
console.log(`операций на кадр   p50 ${p(.5)}   p95 ${p(.95)}   p99 ${p(.99)}   макс ${maxOps}`);
console.log(`перестроений DOM   доска ${els.board?._rebuilds ?? 0}, занятия ${els.acts?._rebuilds ?? 0} за ${FRAMES} кадров`);
const uniq = [...new Set(errs)];
console.log(errs.length ? `\n⚠ ошибок отрисовки: ${errs.length}\n  ` + uniq.slice(0, 6).join("\n  ")
                        : "\n✓ ни одного NaN и битого цвета");
// пороги, как в их profile.mjs: важен хвост, а не медиана
if (p(.99) > p(.5) * 3) console.log("⚠ p99 втрое выше медианы — есть кадры-выбросы");
if ((els.board?._rebuilds ?? 0) > FRAMES / 10) console.log("⚠ DOM перестраивается слишком часто — клики будут теряться");
