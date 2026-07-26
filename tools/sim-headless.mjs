#!/usr/bin/env node
// Гоняет симуляцию без браузера и печатает поведенческие метрики.
// Аналог playtest.mjs: проверяет, что игра вообще проходима.
import fs from "fs";
import vm from "vm";

const file = process.argv[2] || "/mnt/user-data/outputs/knight-order-prototype.html";
const HOURS = Number(process.argv[3] || 2);

function loadSim(path) {
  const html = fs.readFileSync(path, "utf8");
  const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const cut = src.indexOf("/* ==================== ОТРИСОВКА");
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(
    src.slice(0, cut) +
      "\nglobalThis.__api={Sim,ACTS,BLD,STATIONS,BIOMES,SLOTS,PARTS,TRIGS};",
    ctx
  );
  return ctx.__api;
}

// «игрок»: берёт ближайший контракт, лечит гниль, готовится, выходит
function play(api, hours, policy = {}) {
  const { Sim, ACTS, BLD, STATIONS } = api;
  const log = [];
  const s = new Sim((t, tone) => log.push([tone, t]));
  const TICKS = Math.round(hours * 36000);
  let done = 0, spent = 0, ticks = 0;
  const firstBuy = { t: null };

  while (ticks < TICKS) {
    if (s.mode === "town") {
      if (!s.contract) {
        let bi = 0, bd = Infinity;
        s.board.forEach((c, i) => { if (c.dist < bd) { bd = c.dist; bi = i; } });
        s.takeContract(bi);
      }
      // подготовка
      let guard = 0;
      while (guard++ < 8) {
        if (s.pending) break;
        const rot = s.wounds.findIndex(w => w.id === "rot");
        if (rot >= 0 && s.gold >= s.wounds[rot].cost * 1.2 && s.daysLeft() > 3) {
          s.treat(rot, "heal"); continue;
        }
        const bad = s.wounds.findIndex(w => !w.splint && w.sev >= 2);
        if (bad >= 0 && s.daysLeft() > 3) { s.treat(bad, "splint"); continue; }
        const want = s.fatigue > 55 ? "rest" : (policy.train === false ? null : "train");
        const a = want && ACTS.find(x => x.id === want);
        if (a && s.canAct(a)) { s.doAct(a.id); if (!firstBuy.t) firstBuy.t = ticks / 600; }
        else break;
      }
      // тратим заработанное: без этого «деньги некуда девать» показывает
      // не игру, а то, что подставной игрок ничего не покупает
      let spendGuard = 0;
      while (spendGuard++ < 12) {
        const affordable = BLD
          .map(b => ({ id: b.id, c: s.bldCost(b.id) }))
          .filter(b => s.gold >= b.c * 1.6)
          .sort((a, b) => a.c - b.c)[0];
        if (affordable) { s.buy(affordable.id); spent += affordable.c; continue; }
        const st = STATIONS.find(x => !s.stations.includes(x.d) && s.gold >= x.c * 2);
        if (st) { s.buyStation(st.d); spent += st.c; continue; }
        break;
      }
      if (!s.pending && s.contract) s.depart();
    }
    s.tick(0.1); ticks++;
    if (s.k.state === "decide") s.decide(true);
  }
  return { s, log, firstBuy: firstBuy.t };
}

const api = loadSim(file);
const { s, log } = play(api, HOURS);
const st = s.stats;
const rate = st.contracts + st.failed ? (st.contracts / (st.contracts + st.failed) * 100).toFixed(0) : "—";

console.log(`\n=== ПРОГОН ${HOURS} ч игрового времени ===`);
console.log(`контракты      ${st.contracts} исполнено / ${st.failed} провалено (${rate}% успеха)`);
console.log(`день           ${s.day}   репутация ${s.rep}   глава ${s.chapter}`);
console.log(`золото         ${Math.round(s.gold)}   заработано ${Math.round(s.totalEarned)}`);
console.log(`бои            ${st.waves} волн, ${st.kills} убито, ${st.bosses} стражей`);
console.log(`потери         ${s.lost} рыцарей   увечий сейчас ${s.wounds.length}`);
console.log(`снаряжение     ${api.SLOTS.filter(x => s.armory[x]).length}/5 слотов, найдено ${st.items}`);

// красные флаги
const flags = [];
if (st.contracts === 0) flags.push("НИ ОДНОГО контракта не выполнено — цикл разорван");
if (st.failed > st.contracts * 1.5) flags.push("провалов больше, чем успехов — сроки слишком жёсткие");
if (s.lost === 0 && HOURS >= 2) flags.push("никто не погиб — риска нет вовсе");
if (s.lost > HOURS * 8) flags.push("слишком высокая смертность");
if (st.items === 0) flags.push("снаряжение не выпадает");
if (s.gold > s.totalEarned * 0.8 && s.totalEarned > 500) flags.push("деньги некуда тратить — копятся мёртвым грузом");
console.log(flags.length ? "\n⚠ " + flags.join("\n⚠ ") : "\n✓ грубых аномалий нет");
