#!/usr/bin/env node
// Аудит текста: сколько уникальных строк, как быстро начнутся повторы.
// Для текстоцентричной игры это прямой показатель контентного голода.
import fs from "fs";
import vm from "vm";

const file = process.argv[2] || "/mnt/user-data/outputs/knight-order-prototype.html";
const html = fs.readFileSync(file, "utf8");
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const cut = src.indexOf("/* ==================== ОТРИСОВКА");
const c = { console };
vm.createContext(c);
vm.runInContext(src.slice(0, cut) + "\nglobalThis.__api={Sim,ACTS,EVENTS,LORE,CONTRACTS,WOUNDS,PARTS};", c);
const A = c.__api;

const evTotal = Object.values(A.EVENTS).reduce((n, arr) => n + arr.length, 0);
const combos = A.LORE.who.length * A.LORE.from.length * A.LORE.why.length * A.LORE.left.length;

console.log("\n=== ТЕКСТ ===");
console.log(`события          ${evTotal} строк в ${Object.keys(A.EVENTS).length} наборах`);
for (const [k, v] of Object.entries(A.EVENTS)) console.log(`   ${k.padEnd(9)} ${v.length}`);
console.log(`судьбы           ${combos} сочетаний (${A.LORE.who.length}×${A.LORE.from.length}×${A.LORE.why.length}×${A.LORE.left.length})`);
console.log(`имена            ${A.LORE.names.length}×${A.LORE.epi.length} = ${A.LORE.names.length * A.LORE.epi.length}`);
console.log(`контракты        ${A.CONTRACTS.length} типов`);
console.log(`увечья           ${A.WOUNDS.length} типов × ${Object.keys(A.PARTS).length} частей тела = ${A.WOUNDS.length * Object.keys(A.PARTS).length}`);

// когда игрок увидит повтор: событие раз в ~5 сек
const s = new A.Sim(() => {});
const seen = new Set();
let firstRepeat = null, count = 0;
const sim2 = new A.Sim((t, tone) => {
  if (tone !== "normal") return;
  count++;
  if (seen.has(t) && !firstRepeat) firstRepeat = count;
  seen.add(t);
});
sim2.takeContract(0); sim2.depart();
for (let i = 0; i < 60000 && count < 400; i++) {
  sim2.tick(0.1);
  if (sim2.k.state === "decide") sim2.decide(true);
  if (sim2.mode === "town" && !sim2.contract) { sim2.takeContract(0); sim2.depart(); }
}
console.log(`\nпервый повтор    на ${firstRepeat ?? "—"}-м событии (~${firstRepeat ? Math.round(firstRepeat * 5 / 60) : "—"} мин игры)`);
console.log(`уникальных       ${seen.size} из ${count} показанных`);
if (firstRepeat && firstRepeat < 60) console.log("⚠ повторы начинаются слишком рано — нужно больше текста");
const target = 500;
if (evTotal < target) console.log(`⚠ событий ${evTotal}, для релиза ориентир ~${target}`);
