#!/usr/bin/env node
// Прогоняет игру разными стилями и показывает, различаются ли исходы.
// Если все стратегии дают одно и то же — решений в игре нет.
import fs from "fs";
import vm from "vm";

const file = process.argv[2] || "/mnt/user-data/outputs/knight-order-prototype.html";
const HOURS = Number(process.argv[3] || 1.5);

const html = fs.readFileSync(file, "utf8");
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const cut = src.indexOf("/* ==================== ОТРИСОВКА");
const c = { console };
vm.createContext(c);
vm.runInContext(src.slice(0, cut) + "\nglobalThis.__api={Sim,ACTS};", c);
const { Sim, ACTS } = c.__api;

const STYLES = {
  "осторожный":  { pickFar: false, heal: true,  splint: true,  train: true,  greed: .4 },
  "жадный":      { pickFar: true,  heal: false, splint: true,  train: true,  greed: .9 },
  "бережливый":  { pickFar: false, heal: true,  splint: true,  train: false, greed: .3 },
  "безрассудный":{ pickFar: true,  heal: false, splint: false, train: true,  greed: 1  },
};

function run(st) {
  const s = new Sim(() => {});
  const TICKS = Math.round(HOURS * 36000);
  let ticks = 0;
  while (ticks < TICKS) {
    if (s.mode === "town") {
      if (!s.contract) {
        let bi = 0, best = st.pickFar ? -1 : Infinity;
        s.board.forEach((x, i) => {
          const v = x.dist;
          if (st.pickFar ? v > best : v < best) { best = v; bi = i; }
        });
        s.takeContract(bi);
      }
      let g = 0;
      while (g++ < 8 && !s.pending) {
        const rot = s.wounds.findIndex(w => w.id === "rot");
        if (st.heal && rot >= 0 && s.gold >= s.wounds[rot].cost * 1.2 && s.daysLeft() > 3) { s.treat(rot, "heal"); continue; }
        const b = s.wounds.findIndex(w => !w.splint && w.sev >= 2);
        if (st.splint && b >= 0 && s.daysLeft() > 2) { s.treat(b, "splint"); continue; }
        const id = s.fatigue > 55 ? "rest" : (st.train ? "train" : null);
        const a = id && ACTS.find(x => x.id === id);
        if (a && s.canAct(a)) s.doAct(a.id); else break;
      }
      if (!s.pending && s.contract) s.depart();
    }
    s.tick(0.1); ticks++;
    if (s.k.state === "decide") s.decide(Math.random() < st.greed);
  }
  return s;
}

console.log(`\n=== СТИЛИ ИГРЫ, ${HOURS} ч каждый ===`);
console.log("стиль          контракты  провал  смерти  заработок  репутация");
const res = {};
for (const [name, st] of Object.entries(STYLES)) {
  const s = run(st);
  res[name] = Math.round(s.totalEarned);
  console.log(
    name.padEnd(14) +
    String(s.stats.contracts).padStart(6) +
    String(s.stats.failed).padStart(8) +
    String(s.lost).padStart(8) +
    String(Math.round(s.totalEarned)).padStart(11) +
    String(s.rep).padStart(11)
  );
}
const vals = Object.values(res);
const spread = Math.max(...vals) / Math.max(1, Math.min(...vals));
console.log(`\nразброс дохода между стилями: x${spread.toFixed(2)}`);
if (spread < 1.3) console.log("⚠ стили почти не различаются — выбор игрока ни на что не влияет");
else if (spread > 6) console.log("⚠ один стиль доминирует — остальные бессмысленны");
else console.log("✓ стили дают разные исходы, но ни один не доминирует");
