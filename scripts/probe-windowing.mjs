import { spawn } from "node:child_process";
import { cpus } from "node:os";
import { stripVTControlCharacters } from "node:util";
import { maxLoadWorkers, withLoad, loadWorkersRemain } from "./load.mjs";

const mode = process.argv[2];
const runs = Number(process.argv[3] ?? 30);
const perRunSeconds = Number(process.argv[4] ?? 240);
const file = "registry/ouro/components/ouro/message/message-list.windowing.test.tsx";
if (!["loaded", "unloaded"].includes(mode) || !Number.isSafeInteger(runs) || runs < 1 || !Number.isSafeInteger(perRunSeconds) || perRunSeconds < 1) {
  throw new Error("Usage: node scripts/probe-windowing.mjs loaded|unloaded <positive runs> <positive seconds>");
}

function runOnce() {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(
      "timeout",
      ["-k", "10", String(perRunSeconds), "pnpm", "exec", "vitest", "run", "--project", "ouro-chromium", "--retry=0", file],
      { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "true" } },
    );
    let out = "";
    child.stdout.on("data", (chunk) => void (out += chunk));
    child.stderr.on("data", (chunk) => void (out += chunk));
    child.on("exit", (code) => resolve({ code, seconds: (Date.now() - started) / 1000, out }));
  });
}

async function loop() {
  const results = [];
  for (let n = 1; n <= runs; n += 1) {
    const result = await runOnce();
    const cases = Number(stripVTControlCharacters(result.out).match(/Tests\s+(\d+) passed/)?.[1] ?? 0);
    if (result.code === 0 && cases === 0) throw new Error(`Run ${n} reported success without any measured passing cases:\n${result.out}`);
    const hung = result.code === 124 || result.code === 137;
    const status = result.code === 0 ? "pass" : hung ? "HANG" : "fail";
    console.log(`${mode} run ${n}/${runs}: ${status} in ${result.seconds.toFixed(1)} s (exit ${result.code}; ${cases} passing cases)`);
    if (result.code !== 0) {
      const lines = result.out.split("\n");
      const wait = lines.filter((line) => /waiting for|Timeout|timed out|AssertionError|expected \d+/i.test(line)).slice(0, 12);
      console.log(`--- in flight / failure lines (run ${n}) ---\n${wait.join("\n")}\n--- last 40 lines ---\n${lines.slice(-40).join("\n")}\n---`);
    }
    results.push({ status, seconds: result.seconds });
  }
  const count = (status) => results.filter((result) => result.status === status).length;
  const times = results.map((result) => result.seconds).sort((a, b) => a - b);
  const summary = `${mode}: ${runs} runs on ${cpus().length} cpus; pass ${count("pass")}, fail ${count("fail")}, hang ${count("HANG")}; median ${times[Math.floor(times.length / 2)]?.toFixed(1)} s, max ${times.at(-1)?.toFixed(1)} s`;
  console.log(summary);
  if (count("fail") || count("HANG")) process.exitCode = 1;
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }
}

if (mode === "loaded") {
  const workers = maxLoadWorkers();
  console.log(`load: ${workers} busy workers on ${cpus().length} cpus`);
  await withLoad(loop, { workers, seconds: runs * perRunSeconds + 60 });
  console.log(`load workers remain after the run: ${await loadWorkersRemain()}`);
} else {
  await loop();
}
