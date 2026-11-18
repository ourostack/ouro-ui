// A managed Mac's SSO extension, played on a real Mac: CI's `first-run-sso` job (.github/workflows/first-run-sso.yml) runs
// this on a fresh GitHub-hosted macOS runner, never on a person's Mac (it trusts a certificate authority and rewrites
// /etc/hosts for the run). It plays the extension for example.com, holding /held with prompt=none, then reads through
// Apple's networking (NSData, so URLSession) and through curl with no ALPN, as an app's own stack: the silent sign-in must
// be held unanswered, the same path in the open passed to the real host, and the client with no ALPN never seen. Lifting
// it must put /etc/hosts, the system's trust and the keys back as they were.
//
//   node scripts/check/first-run-sso/proof.mts <out folder>
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { judgeHeld, ssoExtension } from "../../../registry/ouro/check/first-run.ts";

const out = path.resolve(process.argv[2] ?? ".tmp/first-run-sso");
fs.mkdirSync(out, { recursive: true });
const t0 = Date.now();
const at = () => Date.now() - t0;
const lines: string[] = [];
const problems: string[] = [];
const expect = (name: string, ok: boolean, evidence: string) => {
  const line = `${ok ? "ok  " : "FAIL"} ${name}: ${evidence}`;
  lines.push(line);
  console.log(line);
  if (!ok) problems.push(name);
};

const HOST = "example.com";
const hold = { path: "^/held$", params: { prompt: "none" } };
const hostsBefore = fs.readFileSync("/etc/hosts", "utf8");
// Its certificates outside what the run uploads.
const dir = path.join(path.dirname(out), "first-run-sso-stand-in");
const standIn = await ssoExtension({ hosts: [HOST], hold }, dir, at, path.join(out, "events.jsonl"));
expect("stand-in", standIn.ok, standIn.evidence);

/** A read through Apple's networking, as a web view's is, given `ms` to answer. */
const apple = (url: string, ms: number) => {
  const r = spawnSync("osascript", ["-l", "JavaScript", "-e", `ObjC.import("Foundation"); const d = $.NSData.dataWithContentsOfURL($.NSURL.URLWithString("${url}")); d.isNil() ? "nothing" : "read " + d.length`], { encoding: "utf8", timeout: ms });
  return r.status === null ? "no answer" : (r.stdout ?? "").trim();
};
const count = (ev: string) => standIn.events().filter((e) => e.ev === ev).length;
if (standIn.ok) {
  const silent = apple(`https://${HOST}/held?prompt=none`, 8000);
  await new Promise((r) => setTimeout(r, 300));
  expect("silent sign-in held", silent === "no answer" && count("held") === 1, `Apple's networking read: ${silent}; held: ${count("held")}`);
  const passedBefore = count("passed");
  const open = apple(`https://${HOST}/held?prompt=login`, 30_000);
  await new Promise((r) => setTimeout(r, 300));
  expect("sign-in page passed", count("passed") === passedBefore + 1, `Apple's networking read: ${open}; passed to ${HOST}: ${count("passed") - passedBefore}`);
  const heldBefore = count("held");
  const own = spawnSync("curl", ["-sS", "--no-alpn", "-o", "/dev/null", "-w", "%{http_code}", "-m", "20", `https://${HOST}/held?prompt=none`], { encoding: "utf8" });
  await new Promise((r) => setTimeout(r, 300));
  expect("own stack untouched", own.status === 0 && count("held") === heldBefore, `curl with no ALPN answered ${own.stdout || own.stderr.trim()} from the real host; the stand-in held nothing more`);
  standIn.lift();
  const judged = judgeHeld(standIn.events(), hold, 20_000);
  expect("judged", judged.ok, judged.evidence);
  const trusted = spawnSync("security", ["find-certificate", "-a", "-Z", "-c", "Ouro first-run SSO stand-in", "/Library/Keychains/System.keychain"], { encoding: "utf8" });
  if (trusted.status === 0) {
    // What the lift's commands say, run again by hand, so a failure here names its cause.
    console.log(trusted.stdout);
    const sha1 = /SHA-1 hash: ([0-9A-F]+)/.exec(trusted.stdout)?.[1] ?? "";
    for (const args of [["security", "remove-trusted-cert", "-d", path.join(dir, "ca.pem")], ["security", "delete-certificate", "-Z", sha1, "-t", "/Library/Keychains/System.keychain"], ["security", "delete-certificate", "-Z", sha1, "/Library/Keychains/System.keychain"]]) {
      const r = spawnSync("sudo", ["-n", ...args], { encoding: "utf8", timeout: 30_000 });
      console.log(`sudo -n ${args.join(" ")}: status ${r.status}, signal ${r.signal}, ${(r.stdout + r.stderr).trim()}`);
    }
  }
  expect("put back", fs.readFileSync("/etc/hosts", "utf8") === hostsBefore && trusted.status !== 0 && !fs.existsSync(path.join(dir, "ca.key")) && !fs.existsSync(path.join(dir, "leaf.key")), `/etc/hosts as before: ${fs.readFileSync("/etc/hosts", "utf8") === hostsBefore}; its authority still in the System keychain: ${trusted.status === 0}; keys left: ${["ca.key", "leaf.key"].filter((k) => fs.existsSync(path.join(dir, k))).join(", ") || "none"}`);
}

const summary = ["## First run on a managed Mac", "", `${problems.length ? `These checks failed: ${problems.join(", ")}` : "Every check passed"}, in ${Math.round(at() / 1000)} s.`, "", "```", ...lines, "```", ""].join("\n");
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
process.exit(problems.length ? 1 : 0);
