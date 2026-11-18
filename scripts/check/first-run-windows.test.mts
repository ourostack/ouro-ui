import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";

import { leftovers } from "../../registry/ouro/check/first-run-machine.ts";
import { offline, unreachable } from "../../registry/ouro/check/first-run-network.ts";
import type { System } from "../../registry/ouro/check/first-run-system.ts";
import { buildWindowsEyes, windowsDataPaths, windowsSystem } from "../../registry/ouro/check/first-run-windows.ts";

// The Windows machine the first-run harness runs on, driven with a made-up machine underneath (a `System` that records what
// it was asked and answers from a script), so every macOS command's Windows answer is read on any host. CI's Windows job
// (scripts/check/first-run-windows-proof.mts) runs the same System on a real Windows runner.

const scratch = mkdtempSync(join(os.tmpdir(), "ouro-first-run-windows-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

type Ran = { cmd: string; args: string[]; o: { input?: string; timeout?: number } | undefined };
function machine(answer: (cmd: string, args: string[]) => Partial<ReturnType<System["run"]>> = () => ({})) {
  const ran: Ran[] = [];
  const started: string[][] = [];
  const slept: number[] = [];
  const base: System = {
    run(cmd, args, o) {
      ran.push({ cmd, args, o });
      return { status: 0, stdout: "", stderr: "", ...answer(cmd, args) };
    },
    start: (cmd, args) => void started.push([cmd, ...args]),
    sleep: async (ms) => void slept.push(ms),
  };
  return { base, ran, started, slept, last: () => ran.at(-1)!, script: () => ran.at(-1)!.args.at(-1)! };
}

function withEnv(env: Record<string, string | undefined>, f: () => void) {
  const was = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  const put = (e: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(e)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  put(env);
  try {
    f();
  } finally {
    put(was);
  }
}

describe("first-run harness on Windows", () => {
  test("builds the eyes with the .NET Framework's csc against UI Automation, and names the compiler when it fails", () => {
    const m = machine();
    const out = join(scratch, "eyes", "uia-tree.exe");
    withEnv({ WINDIR: "D:\\Win" }, () => assert.equal(buildWindowsEyes(out, m.base), out));
    const fw = join("D:\\Win", "Microsoft.NET", "Framework64", "v4.0.30319");
    assert.equal(m.last().cmd, join(fw, "csc.exe"));
    const wpf = ["UIAutomationClient.dll", "UIAutomationTypes.dll", "WindowsBase.dll"].map((dll) => `/r:${join(fw, "WPF", dll)}`);
    assert.deepEqual(m.last().args.slice(0, -1), ["/nologo", "/optimize+", "/target:exe", `/out:${out}`, ...wpf, "/r:System.Drawing.dll", "/r:System.Web.Extensions.dll"]);
    assert.match(m.last().args.at(-1)!, /registry[/\\]ouro[/\\]check[/\\]first-run-uia-tree\.cs$/);
    assert.equal(m.last().o?.timeout, 300_000);

    const failed = machine(() => ({ status: 1, stdout: "", stderr: "error CS0246: UIAutomationClient" }));
    withEnv({ WINDIR: undefined }, () => assert.throws(() => buildWindowsEyes(out, failed.base), /first-run-uia-tree\.cs did not build with C:\\Windows.*csc\.exe: error CS0246/));
    const said = machine(() => ({ status: 1, stdout: "csc said this", stderr: "" }));
    assert.throws(() => buildWindowsEyes(out, said.base), /: csc said this$/);
    const long = machine(() => ({ status: 1, stdout: `${"x".repeat(600)}never shown`, stderr: "" }));
    assert.throws(() => buildWindowsEyes(out, long.base), (e: Error) => e.message.endsWith(`: ${"x".repeat(600)}`));
  });

  test("answers screencapture, pgrep, pkill, curl, dscacheutil and defaults as Windows does", () => {
    const m = machine((cmd, args) => {
      const script = args.at(-1) ?? "";
      if (cmd === "powershell.exe" && script.startsWith("(Get-Process")) return { stdout: script.includes("'Example'") ? " 12  34\r\n" : "\r\n" };
      if (cmd === "powershell.exe" && script.startsWith("(Resolve-DnsName")) return { stdout: script.includes("'example.com'") ? " 93.184.215.14  2606:2800:21f:cb07::1\r\n" : "\r\n" };
      return {};
    });
    const sys = windowsSystem({ eyes: "C:\\eyes.exe" }, m.base);

    sys.run("screencapture", ["-x", "-R", "10,20,300,400", "C:\\s.png"], { timeout: 5000 });
    assert.deepEqual([m.last().cmd, m.last().args, m.last().o], ["C:\\eyes.exe", ["--shot", "C:\\s.png", "10", "20", "300", "400"], { timeout: 5000 }]);
    sys.run("screencapture", ["-R", "1,2,3,4", "C:\\r.png"]);
    assert.deepEqual(m.last().args, ["--shot", "C:\\r.png", "1", "2", "3", "4"]);
    sys.run("screencapture", ["-x", "C:\\whole.png"]);
    assert.deepEqual([m.last().args, m.last().o], [["--shot", "C:\\whole.png"], { timeout: 20_000 }]);

    assert.deepEqual(sys.run("pgrep", ["-x", "Example"]), { status: 0, stdout: "12\n34", stderr: "" });
    assert.deepEqual([m.last().args.slice(0, -1), m.last().o], [["-NoProfile", "-NonInteractive", "-Command"], { timeout: 60_000 }]);
    assert.match(m.script(), /^\(Get-Process -Name 'Example' -ErrorAction SilentlyContinue\)\.Id -join ' '$/);
    assert.equal(sys.run("pgrep", ["Example"]).stdout, "12\n34");
    assert.equal(sys.run("pgrep", ["-x", "Other"]).status, 1);

    sys.run("pkill", ["-9", "-f", "C:\\Program Files\\Ada's App"]);
    assert.equal(m.last().cmd, "powershell.exe");
    assert.match(m.script(), /\$_\.CommandLine -like '\*C:\\Program Files\\Ada''s App\*' \} \| ForEach-Object \{ Stop-Process -Id \$_\.ProcessId -Force \}/);

    sys.run("curl", ["-sS", "-o", "/dev/null", "-m", "6", "https://example.com"], { timeout: 9000 });
    assert.deepEqual([m.last().cmd, m.last().args, m.last().o], ["curl.exe", ["-sS", "-o", "NUL", "-m", "6", "https://example.com"], { timeout: 9000 }]);

    assert.deepEqual(sys.run("dscacheutil", ["-q", "host", "-a", "name", "example.com"]), { status: 0, stdout: "ip_address: 93.184.215.14\nipv6_address: 2606:2800:21f:cb07::1", stderr: "" });
    assert.match(m.script(), /Resolve-DnsName -Name 'example\.com'/);
    assert.deepEqual(m.last().o, { timeout: 30_000 });
    assert.deepEqual(sys.run("dscacheutil", ["-q", "host", "-a", "name", "nowhere.invalid"]).stdout, "");

    const before = m.ran.length;
    assert.deepEqual(sys.run("defaults", ["delete", "Example"]), { status: 0, stdout: "", stderr: "" });
    assert.equal(m.ran.length, before, "defaults has nothing to do on Windows");

    const own = machine();
    const pkilled: string[] = [];
    const mine = windowsSystem({ eyes: "e", pgrep: (name) => (name === "Example" ? [7] : []), pkill: (p) => void pkilled.push(p) }, own.base);
    assert.equal(mine.run("pgrep", ["-x", "Example"]).stdout, "7");
    assert.equal(mine.run("pgrep", ["-x", "UserNotificationCenter"]).status, 1);
    mine.run("pkill", ["-9", "-f", "Example.exe"]);
    assert.deepEqual([pkilled, own.ran], [["Example.exe"], []]);
  });

  test("holds the network with Windows Firewall's outbound rules, turns the firewall on for the hold, and puts it back", () => {
    let rule = false;
    let firewallOff = "Domain,Public";
    const m = machine((cmd, args) => {
      const script = args.at(-1) ?? "";
      if (cmd === "curl.exe") return { status: rule ? 7 : 0 };
      if (script.startsWith("(Get-NetFirewallProfile")) return { stdout: `${firewallOff}\r\n` };
      if (script.startsWith("New-NetFirewallRule")) rule = true;
      if (script.startsWith("Remove-NetFirewallRule")) rule = false;
      if (script.startsWith("(Resolve-DnsName")) return { stdout: "20.190.151.7\r\n" };
      return {};
    });
    const sys = windowsSystem({ eyes: "e" }, m.base);
    const scripts = () => m.ran.filter((r) => r.cmd === "powershell.exe").map((r) => r.args.at(-1)!);

    const block = unreachable({ hosts: ["login.example.com"], ranges: ["40.126.0.0/18"], probe: "https://login.example.com" }, "the sign-in unreachable", "hang", sys);
    assert.equal(block.ok, true, block.evidence);
    assert.ok(scripts().includes("Set-NetFirewallProfile -All -Enabled True -DefaultOutboundAction Allow -DefaultInboundAction Allow"));
    assert.ok(scripts().includes("New-NetFirewallRule -DisplayName 'ouro-first-run' -Direction Outbound -Action Block -RemoteAddress '40.126.0.0/18','20.190.151.7' | Out-Null"));
    block.lift();
    assert.equal(rule, false);
    assert.deepEqual(scripts().slice(-2), ["Remove-NetFirewallRule -DisplayName 'ouro-first-run' -ErrorAction SilentlyContinue; exit 0", "Set-NetFirewallProfile -Profile Domain,Public -Enabled False"]);
    const lifted = scripts().length;
    sys.run("sudo", ["-n", "pfctl", "-X", "1"]);
    assert.equal(scripts().length, lifted, "the firewall is put back once");

    // Offline is everything but loopback; a firewall already on is left as it was.
    firewallOff = "";
    const count = scripts().length;
    const all = offline("https://example.com", sys);
    assert.equal(all.ok, true, all.evidence);
    assert.ok(scripts().includes("New-NetFirewallRule -DisplayName 'ouro-first-run' -Direction Outbound -Action Block -RemoteAddress '0.0.0.0-126.255.255.255','128.0.0.0-255.255.255.255','::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff' | Out-Null"));
    all.lift();
    assert.ok(!scripts().slice(count).some((s) => s.startsWith("Set-NetFirewallProfile")), "the firewall was on, so nothing turned it on or off");
    // Putting the firewall back happens once: a second -X, or one before any -E, has nothing to put back.
    const fresh = machine();
    const other = windowsSystem({ eyes: "e" }, fresh.base);
    other.run("sudo", ["-n", "pfctl", "-X", "1"]);
    assert.deepEqual(fresh.ran, []);

    // Rules with no address hold nothing, and the system ruleset is nothing to load.
    assert.deepEqual(sys.run("sudo", ["-n", "pfctl", "-a", "com.apple/ouro-first-run", "-f", "-"], { input: "block return out quick inet proto tcp\n" }), { status: 1, stdout: "", stderr: "no addresses in the rules" });
    assert.deepEqual(sys.run("sudo", ["-n", "pfctl", "-a", "com.apple/ouro-first-run", "-f", "-"]), { status: 1, stdout: "", stderr: "no addresses in the rules" });
    assert.deepEqual(sys.run("sudo", ["-n", "pfctl", "-f", "/etc/pf.conf"]), { status: 0, stdout: "", stderr: "" });
    const asked = scripts().length;
    for (const args of [["-s", "x", "-F", "all"], ["-s", "x", "-f", "-"], ["-a", "x", "-s", "rules"]]) assert.deepEqual(sys.run("sudo", ["-n", "pfctl", ...args], { input: "block return out quick inet proto tcp to { 10.0.0.1 }\n" }), { status: 0, stdout: "", stderr: "" });
    assert.equal(scripts().length, asked, "only an anchor's flush and load touch the firewall");
    // Only block rules count, and only a rule for all traffic takes everything.
    sys.run("sudo", ["-n", "pfctl", "-a", "com.apple/ouro-first-run", "-f", "-"], { input: "pass out quick inet to { 9.9.9.9 }\n# block drop out quick inet to { 8.8.8.8 }\nblock drop out quick allow-listed to { 10.0.0.1 }\n" });
    assert.match(scripts().at(-1)!, / -RemoteAddress '10\.0\.0\.1' \| Out-Null$/);
    assert.deepEqual(sys.run("sudo", ["-n", "pfctl", "-X", "1"]), { status: 0, stdout: "", stderr: "" });
  });

  test("lists the Run keys and the Startup folder as login items, which leftovers reads", () => {
    const appdata = join(scratch, "Roaming");
    const startup = join(appdata, "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
    mkdirSync(startup, { recursive: true });
    writeFileSync(join(startup, "Example.lnk"), "");
    const m = machine((cmd, args) => {
      if (cmd === "reg" && args[1]!.startsWith("HKCU")) return { stdout: "\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\r\n    Example    REG_SZ    C:\\Example\\Example.exe --background\r\n\r\n" };
      if (cmd === "reg" && args[1]!.startsWith("HKLM")) return { stdout: "\nHKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\n    Updater    REG_EXPAND_SZ    C:\\Updater.exe\n    Agent    REG_SZ    C:\\Agent.exe\n" };
      if (cmd === "sudo") return { status: 0, stdout: "passed through" };
      return {};
    });
    const sys = windowsSystem({ eyes: "e" }, m.base);
    withEnv({ APPDATA: appdata }, () => {
      const dump = sys.run("sudo", ["-n", "sfltool", "dumpbtm"]).stdout;
      assert.deepEqual(m.ran.map((r) => [r.cmd, ...r.args]), [["reg", "query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"], ["reg", "query", "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"]]);
      const entry = (i: number, name: string) => `\n #${i}:\n Name: ${name}\n Disposition: [enabled, allowed, visible]\n`;
      assert.equal(dump, [entry(1, "Example    REG_SZ    C:\\Example\\Example.exe --background"), entry(2, "Updater    REG_EXPAND_SZ    C:\\Updater.exe"), entry(3, "Agent    REG_SZ    C:\\Agent.exe"), entry(4, join(startup, "Example.lnk"))].join(""));
      assert.deepEqual(leftovers({ bundle: join(scratch, "nowhere"), id: "Example" }, { home: scratch, sys }), [`a login item turned on: Example    REG_SZ    C:\\Example\\Example.exe --background, ${join(startup, "Example.lnk")}`]);
    });
    withEnv({ APPDATA: undefined }, () => assert.equal(sys.run("sudo", ["-n", "sfltool", "dumpbtm"]).stdout.match(/#\d+:/g)?.length, 3));
    withEnv({ APPDATA: join(scratch, "no-startup-folder") }, () => assert.equal(sys.run("sudo", ["-n", "sfltool", "dumpbtm"]).stdout.match(/#\d+:/g)?.length, 3));
    // Any other tool under sudo runs as it is.
    assert.equal(sys.run("sudo", ["-n", "whoami"]).stdout, "");
    assert.deepEqual([m.last().cmd, m.last().args], ["whoami", []]);
  });

  test("starts the app with its own open, else the shell's start, and passes other commands to the machine", async () => {
    const m = machine((cmd) => (cmd === "git" ? { stdout: "ran" } : {}));
    const opened: string[] = [];
    const sys = windowsSystem({ eyes: "e", open: (t) => void opened.push(t) }, m.base);
    sys.start("open", ["C:\\Start Menu\\Example.lnk"]);
    sys.start("node", ["helper.js"]);
    assert.deepEqual([opened, m.started], [["C:\\Start Menu\\Example.lnk"], [["node", "helper.js"]]]);
    assert.equal(sys.run("git", ["status"]).stdout, "ran");
    await sys.sleep(250);
    assert.deepEqual(m.slept, [250]);
    // With no open of the app's own, the shell opens it.
    const shell = machine();
    windowsSystem({ eyes: "e" }, shell.base).start("open", ["-a", "C:\\Start Menu\\Example.lnk"]);
    assert.deepEqual(shell.started, [["cmd.exe", "/c", "start", "", "C:\\Start Menu\\Example.lnk"]]);
    // On this machine by default.
    await windowsSystem({ eyes: "e" }).sleep(1);
  });

  test("names the app's local and roaming data folders and its Start menu shortcut", () => {
    withEnv({ LOCALAPPDATA: "C:\\Users\\ada\\AppData\\Local", APPDATA: "C:\\Users\\ada\\AppData\\Roaming" }, () =>
      assert.deepEqual(windowsDataPaths({ folder: "Vendor\\Example", shortcut: "Example" }), [
        join("C:\\Users\\ada\\AppData\\Local", "Vendor\\Example"),
        join("C:\\Users\\ada\\AppData\\Roaming", "Vendor\\Example"),
        join("C:\\Users\\ada\\AppData\\Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Example.lnk"),
      ]),
    );
    withEnv({ LOCALAPPDATA: undefined, APPDATA: undefined }, () => assert.deepEqual(windowsDataPaths({ folder: "Example" }), ["Example", "Example"]));
  });
});
