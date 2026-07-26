#!/usr/bin/env node
// Один прогон всех проверок. Возвращает ненулевой код, если есть красные флаги —
// чтобы можно было повесить на git-хук или CI.
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || "/mnt/user-data/outputs/knight-order-prototype.html";
const steps = [
  ["симуляция",  "sim-headless.mjs",  [file, "2"]],
  ["отрисовка",  "render-check.mjs",  [file, "600"]],
  ["баланс",     "balance-sweep.mjs", [file, "1.5"]],
  ["текст",      "text-audit.mjs",    [file]],
];
let flags = 0;
for (const [name, script, args] of steps) {
  let out;
  try {
    out = execFileSync("node", [path.join(here, script), ...args], { encoding: "utf8" });
  } catch (e) {
    console.log(`\n=== ${name}: ПРОВАЛ ===`);
    console.log((e.stdout || "") + (e.stderr || "").split("\n").slice(0, 4).join("\n"));
    flags++; continue;
  }
  process.stdout.write(out);
  flags += (out.match(/⚠/g) || []).length;
}
console.log("\n" + "─".repeat(52));
console.log(flags ? `ИТОГО: ${flags} предупреждений` : "ИТОГО: чисто");
process.exit(flags > 0 ? 1 : 0);
