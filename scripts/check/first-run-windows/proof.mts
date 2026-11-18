// The first-run harness on a real Windows machine: CI's `first-run-windows` job (.github/workflows/first-run-windows.yml)
// runs this on a fresh GitHub-hosted Windows runner, never on a person's PC (it opens windows, types and changes the
// firewall). It builds the eyes from first-run-uia-tree.cs, proves the Windows System's answers on the machine itself
// (a screenshot, a firewall hold that a request meets and that lifts, a Run key read as a login item), then drives
// app.html, opened in Edge as an app, through the harness's dismiss-escape detour twice: as written, which must pass, and
// with ?fault=blank, where putting the welcome away leaves a blank page, which must fail on that dismissal.
//
//   node scripts/check/first-run-windows/proof.mts <out folder>
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { buildWindowsEyes, DEFAULT_VOCABULARY, DETOURS, Eyes, FirstRunSession, leftovers, reachable, unreachable, windowsDataPaths, windowsSystem, type AppConfig, type Report, type Snapshot } from "../../../registry/ouro/check/first-run.ts";

const out = path.resolve(process.argv[2] ?? ".tmp/first-run-windows");
fs.mkdirSync(out, { recursive: true });
const t0 = Date.now();
const at = () => Date.now() - t0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lines: string[] = [];
const problems: string[] = [];
const say = (line: string) => {
  lines.push(line);
  console.log(line);
};
const expect = (name: string, ok: boolean, evidence: string) => {
  say(`${ok ? "ok  " : "FAIL"} ${name}: ${evidence}`);
  if (!ok) problems.push(name);
};

const edge = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].find((p) => fs.existsSync(p));
if (!edge) throw new Error("no Microsoft Edge on this runner");

// The app's own answers (signed in, synced) come from the page, which tells this server.
const state = { signedIn: false, synced: false };
const page = fs.readFileSync(path.join(import.meta.dirname, "app.html"));
const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/signed-in") state.signedIn = true;
  if (req.method === "POST" && req.url === "/synced") state.synced = true;
  res.writeHead(200, { "content-type": req.method === "POST" ? "text/plain" : "text/html; charset=utf-8" });
  res.end(req.method === "POST" ? "" : page);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as { port: number }).port;

const eyesExe = buildWindowsEyes(path.join(out, "uia-tree.exe"));
say(`built the eyes with csc in ${Math.round(at() / 100) / 10} s`);
let appPid = 0;
const sys = windowsSystem({ eyes: eyesExe, pgrep: (name) => (name === "msedge" && appPid ? [appPid] : []) });

// The System's answers on this machine.
const shot = path.join(out, "screen.png");
sys.run("screencapture", ["-x", shot]);
expect("screencapture", fs.existsSync(shot) && fs.statSync(shot).size > 1000, `the eyes' one-shot picture is ${fs.existsSync(shot) ? fs.statSync(shot).size : 0} bytes`);
// With the Public profile off first, as a machine may have it: the hold turns it on, and lifting it puts it back as it was.
const powershell = (command: string) => spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8" }).stdout.trim();
const publicProfile = () => powershell("$p = Get-NetFirewallProfile -Name Public; '' + $p.Enabled + ':' + $p.DefaultInboundAction + ':' + $p.DefaultOutboundAction");
const original = publicProfile();
powershell("Set-NetFirewallProfile -Profile Public -Enabled False");
const off = publicProfile();
const before = reachable("https://example.com", sys);
const hold = unreachable({ hosts: ["example.com"], ranges: [], probe: "https://example.com" }, "example.com unreachable", "refuse", sys);
hold.lift();
const back = reachable("https://example.com", sys);
const after = publicProfile();
powershell(`Set-NetFirewallProfile -Profile Public -Enabled ${original.split(":")[0]}`);
expect("firewall", before && hold.ok && back && after === off, `example.com answered: ${before}; ${hold.evidence}; answered once lifted: ${back}; the Public profile was ${original}, off for the hold ${off}, after it ${after}`);
const runKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
spawnSync("reg", ["add", runKey, "/v", "OuroFirstRunProof", "/d", "C:\\OuroFirstRunProof\\proof.exe", "/f"]);
const login = leftovers({ bundle: "C:\\OuroFirstRunProof", id: "OuroFirstRunProof", extraPaths: windowsDataPaths({ folder: "OuroFirstRunProof", shortcut: "OuroFirstRunProof" }) }, { sys });
spawnSync("reg", ["delete", runKey, "/v", "OuroFirstRunProof", "/f"]);
const clean = leftovers({ bundle: "C:\\OuroFirstRunProof", id: "OuroFirstRunProof", extraPaths: windowsDataPaths({ folder: "OuroFirstRunProof", shortcut: "OuroFirstRunProof" }) }, { sys });
expect("login items", login.length === 1 && /a login item turned on: OuroFirstRunProof/.test(login[0]!) && clean.length === 0, `with a Run key: ${JSON.stringify(login)}; without: ${JSON.stringify(clean)}`);

type Window = { owner: string; pid: number; name: string; w: number };

/** app.html as the harness drives an app: opened in Edge as an app window, with its own profile. */
function exampleApp(eyes: Eyes, fault: string, profile: string): AppConfig {
  const pid = async () => {
    const w = ((await eyes.ask<{ windows?: Window[] }>("windows")).windows ?? []).find((x) => /^msedge$/i.test(x.owner) && x.name.startsWith("Ouro Example") && x.w > 300);
    appPid = w?.pid ?? 0;
    return appPid;
  };
  const headingsOf = (s: Snapshot) => s.windows.flatMap((w) => w.nodes).filter((n) => n.role === "AXHeading").map((n) => n.words ?? "");
  const launch = () => void spawn(edge!, [`--app=http://127.0.0.1:${port}/${fault ? `?fault=${fault}` : ""}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-sync", "--window-size=960,700", "--window-position=20,20"], { stdio: "ignore", detached: true }).unref();
  return {
    vocabulary: DEFAULT_VOCABULARY,
    bundle: "Ouro Example",
    processName: "msedge",
    pid,
    signedIn: async () => state.signedIn,
    synced: () => state.synced,
    checkpoint: (s) => (headingsOf(s).some((h) => h.startsWith("Inbox")) ? "inbox" : s.windows.some((w) => w.nodes.some((n) => /^Signing in/.test(n.words ?? ""))) ? "signing-in" : "sign-in"),
    beforeSignIn: (cp) => cp !== "inbox",
    signInPage: () => false,
    async advance() {
      await eyes.press(await pid(), "Sign in");
    },
    async open() {
      launch();
      for (const until = Date.now() + 60_000; Date.now() < until; await sleep(500)) if (await pid()) return true;
      return false;
    },
    async quit() {
      sys.run("pkill", ["-9", "-f", profile]);
      for (let i = 0; i < 20 && (await pid()); i++) await sleep(500);
      return !(await pid());
    },
    activate: () => void pid().then((p) => (p ? eyes.ask(`activate ${p}`) : null)),
    controls: [],
    spaces: [],
    signInNetwork: { hosts: [], ranges: [], probe: "https://example.com" },
  };
}

/** One run of the dismiss-escape detour; its steps, by name and verdict. */
async function run(name: string, fault: string): Promise<{ ok: boolean; steps: { name: string; ok: boolean; evidence: string }[]; ms: number }> {
  Object.assign(state, { signedIn: false, synced: false });
  const steps: { name: string; ok: boolean; evidence: string }[] = [];
  const report: Report = { step: (n, ok, evidence) => void steps.push({ name: n, ok, evidence }), note: () => {}, log: (m) => console.log(`  ${m}`), at };
  const eyes = new Eyes(eyesExe, sys);
  const app = exampleApp(eyes, fault, path.join(out, name, "profile"));
  const session = new FirstRunSession({ out: path.join(out, name), eyes, app, report, limits: { syncedMs: 45_000 }, system: sys });
  const start = at();
  await session.run(DETOURS.find((d) => d.id === "dismiss-escape")!);
  await app.quit();
  const ok = session.finish(name);
  for (const s of steps) say(`  ${s.ok ? "ok  " : "FAIL"} ${s.name}: ${s.evidence}`);
  return { ok, steps, ms: at() - start };
}

const good = await run("as-written", "");
expect("as written", good.ok && good.steps.some((s) => s.name === "dismiss-escape-1" && s.ok) && good.steps.some((s) => s.name === "synced" && s.ok), `the harness ${good.ok ? "passed" : "failed"} it in ${Math.round(good.ms / 1000)} s, Escape on the welcome judged and signed in and synced`);
const blank = await run("blank-after-dismiss", "blank");
const caught = blank.steps.find((s) => s.name === "dismiss-escape-1");
expect("blank after dismiss", !blank.ok && caught?.ok === false, `the harness ${blank.ok ? "passed" : "failed"} it in ${Math.round(blank.ms / 1000)} s; its dismissal: ${caught?.evidence ?? "never judged"}`);

server.close();
const summary = [`## First run on Windows`, "", `${problems.length ? `${problems.length} of the proof's checks failed: ${problems.join(", ")}` : "Every check passed"}, in ${Math.round(at() / 1000)} s.`, "", "```", ...lines, "```", ""].join("\n");
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
process.exit(problems.length ? 1 : 0);
