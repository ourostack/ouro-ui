import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";

import { DETOURS, NIGHTLY_DETOURS, RELEASE_DETOURS, type Detour } from "../../registry/ouro/check/first-run-detours.ts";
import type { Eyes } from "../../registry/ouro/check/first-run-eyes.ts";
import type { AxNode, Pixels, Snapshot } from "../../registry/ouro/check/first-run-judges.ts";
import { FirstRunSession, LIMITS, type AppConfig, type Control } from "../../registry/ouro/check/first-run-session.ts";
import { system, type System } from "../../registry/ouro/check/first-run-system.ts";

// The first-run harness's session and detours (registry/ouro/check/first-run-session.ts and first-run-detours.ts), driven
// against a made-up app: a world of screens the fake eyes read, a clock that moves only when the session waits, and a
// machine that records what it was asked. Part of Ouro check's Node side tests (scripts/check.test.mjs).

type Spec = [depth: number, role: string, words?: string, extra?: Partial<AxNode>];
type Screen = { rows: Spec[]; signedIn: boolean | null; synced?: boolean; cp?: string };
type Answer = { ok: boolean; why?: string };

const windowRow: Spec = [0, "AXWindow", "App", { x: 0, y: 0, w: 1024, h: 768 }];
const webRow: Spec = [1, "AXWebArea", undefined, { x: 0, y: 0, w: 1024, h: 768 }];
const mainRow: Spec = [2, "AXGroup", undefined, { subrole: "AXLandmarkMain", x: 80, y: 80, w: 900, h: 600 }];
const inMain = (rows: Spec[]): Spec[] => rows.map(([d, ...rest]) => [d + 3, ...rest] as Spec);
/** A window whose main landmark holds `rows`, and, with `dialog`, a dialog over it holding those. */
function screen(rows: Spec[], o: { signedIn?: boolean | null; synced?: boolean; cp?: string; dialog?: Spec[]; dialogRect?: Partial<AxNode> } = {}): Screen {
  const dialog: Spec[] = o.dialog ? [[2, "AXGroup", undefined, { subrole: "AXApplicationDialog", x: 256, y: 100, w: 512, h: 500, ...o.dialogRect }], ...o.dialog.map(([d, ...rest]) => [d + 3, ...rest] as Spec)] : [];
  return { rows: [windowRow, webRow, mainRow, ...inMain(rows), ...dialog], signedIn: o.signedIn ?? null, synced: o.synced ?? false, cp: o.cp ?? "window" };
}
function windowOf(rows: Spec[]) {
  const parents: number[] = [];
  const nodes = rows.map(([d, role, words, extra], i) => {
    parents[d] = i;
    return { i, p: d === 0 ? -1 : parents[d - 1]!, d, role, words, enabled: true, x: 100, y: 100, w: 200, h: 40, ...extra } as AxNode;
  });
  const [win] = nodes;
  return { title: "App", x: win!.x!, y: win!.y!, w: win!.w!, h: win!.h!, nodes };
}

const signIn = (o: { cp?: string } = {}) => screen([[0, "AXHeading", "Sign in"], [0, "AXButton", "Sign in"]], { signedIn: false, cp: o.cp ?? "sign-in: email" });
const inbox = (synced = true) => screen([[0, "AXHeading", "Inbox"], [0, "AXStaticText", "Ada: lunch?"]], { signedIn: true, synced, cp: "inbox" });
const blank = (signedIn: boolean | null = true) => screen([], { signedIn, cp: "blank" });
const welcome = (main: Spec[] = []) => screen(main, { signedIn: true, cp: "welcome", dialog: [[0, "AXHeading", "Welcome, Ada"], [0, "AXStaticText", "Getting your chats…"], [0, "AXButton", "Close"]] });
const signedOut = () => screen([[0, "AXHeading", "You're signed out"], [0, "AXButton", "Sign in"]], { signedIn: false, cp: "signed out" });

/** The made-up app and machine: what the eyes read, what the session asked, and a clock that moves when it waits. */
class World {
  now = 0;
  screen: Screen | null = null;
  shown = true;
  pid = 42;
  calls: string[] = [];
  pixels: Pixels | null = { uniform: 0.5, mean: 128 };
  reads: { at: number; uniform: number }[] = [];
  menu: { ok: boolean; items: { title: string; enabled: boolean }[]; why?: string } = { ok: true, items: [] };
  pgrep = "";
  shoot = true;
  reachable = false;
  /** Whether each look sees the app's screen or none. */
  path: Screen[] = [];
  onPress: (label: string) => Answer = () => ({ ok: true });
  onKey: (name: string) => void = () => {};
  onClick: () => void = () => {};
  onCloseWindow: () => void = () => {};
  onExtraPress: (title: string) => void = () => {};
  onStart: () => void = () => {};
  tick: () => void = () => {};
  eyes = {
    tree: async () => (this.screen ? [windowOf(this.screen.rows)] : []),
    shown: async () => this.shown && this.screen !== null,
    closeWindow: async () => {
      this.calls.push("close-window");
      this.onCloseWindow();
      return { ok: true };
    },
    extraMenu: async () => {
      this.calls.push("extra-menu");
      return this.menu;
    },
    extraPress: async (title: string) => {
      this.calls.push(`extra-press ${title}`);
      this.onExtraPress(title);
      return { ok: true };
    },
    press: async (_pid: number, label: string) => {
      this.calls.push(`press ${label}`);
      return this.onPress(label);
    },
    key: async (name: string) => {
      this.calls.push(`key ${name}`);
      this.onKey(name);
      return { ok: true };
    },
    click: async (x: number, y: number) => {
      this.calls.push(`click ${x},${y}`);
      this.onClick();
      return { ok: true };
    },
    pixels: async () => this.pixels,
    sample: async (_rect: unknown, ms: number) => {
      this.now += ms;
      return this.reads;
    },
    stop: () => {
      this.calls.push("stop");
    },
  } as unknown as Eyes;
  sys: System = {
    run: (cmd, args) => {
      this.calls.push(`run ${cmd} ${args.join(" ")}`);
      if (cmd === "screencapture" && this.shoot) fs.writeFileSync(args.at(-1)!, "png");
      if (cmd === "pgrep") return { status: 0, stdout: this.pgrep, stderr: "" };
      if (cmd === "curl") return { status: this.reachable ? 0 : 7, stdout: "", stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    },
    start: (cmd, args) => {
      this.calls.push(`start ${cmd} ${args.join(" ")}`);
      this.onStart();
    },
    sleep: async (ms) => {
      this.now += ms;
      this.tick();
    },
  };
}

const network = { hosts: [], ranges: ["10.0.0.0/8"], probe: "https://login.example.test/health" };

function app(w: World, o: Partial<AppConfig> = {}): AppConfig {
  return {
    vocabulary: {
      forward: /^(Sign in|Next|Retry|Try again|Continue|No|Skip)$/,
      progress: /(…|\.\.\.)$|^(Loading|Signing)\b/,
      emptyWhileSignedIn: /All caught up|Nothing new/,
      close: /^(Close|×)$/,
    },
    bundle: "/Applications/Example.app",
    processName: "Example",
    pid: async () => (w.screen ? w.pid : 0),
    signedIn: async () => w.screen?.signedIn ?? null,
    synced: () => w.screen?.synced === true,
    checkpoint: () => w.screen?.cp ?? "none",
    beforeSignIn: (cp) => cp.startsWith("sign-in"),
    signInPage: (cp) => cp.startsWith("sign-in"),
    advance: async () => {
      w.screen = w.path.shift() ?? w.screen;
    },
    open: async () => {
      w.screen = w.path.shift() ?? w.screen;
      return w.screen !== null;
    },
    quit: async () => {
      w.screen = null;
      return true;
    },
    activate: () => {
      w.calls.push("activate");
    },
    controls: [],
    spaces: [],
    signInNetwork: network,
    ...o,
  };
}

function session(w: World, o: Partial<AppConfig> = {}, limits: Partial<typeof LIMITS> = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "first-run-session-"));
  const steps: { name: string; ok: boolean; evidence: string }[] = [];
  const notes: string[] = [];
  const logs: string[] = [];
  const report = { step: (name: string, ok: boolean, evidence: string) => steps.push({ name, ok, evidence }), note: (event: string) => notes.push(event), log: (msg: string) => logs.push(msg), at: () => w.now };
  const s = new FirstRunSession({ out, eyes: w.eyes, app: app(w, o), report, limits, system: w.sys });
  const step = (name: string) => steps.find((x) => x.name === name);
  return { s, out, steps, notes, logs, step, gate: path.join(out, "gate") };
}

const snapOf = (sc: Screen, signedIn = sc.signedIn): Snapshot => ({ at: 0, windows: [windowOf(sc.rows)], signedIn });

describe("first-run harness: the session's path to signed in and synced", () => {
  test("goes from the sign-in page to synced through the app's own steps, keeping a picture and a tree of each state", async () => {
    const w = new World();
    w.screen = signIn();
    w.path = [welcome(), inbox()];
    const { s, step, gate } = session(w);
    assert.equal(await s.toGoal("synced"), true);
    assert.match(step("synced")!.evidence, /^signed in and synced \d+(\.\d)? s after it began \(the limit is 150 s\)$/);
    assert.deepEqual(s.timings.map((t) => [t.step, t.ok]), [["synced", true]]);
    const states = fs.readdirSync(path.join(gate, "states")).sort();
    assert.deepEqual(states.filter((f) => f.endsWith(".txt")), ["01-Sign-in.txt", "02-dialog-Welcome-Ada.txt", "03-Inbox.txt"]);
    assert.match(fs.readFileSync(path.join(gate, "states", "01-Sign-in.txt"), "utf8"), /^synced\nsigned in: false; synced: false; pixels: \{"uniform":0\.5,"mean":128\}\nok {3}the main pane shows/);
    assert.ok(fs.existsSync(path.join(gate, "states", "01-Sign-in.png")));
    assert.equal(s.checkpoint(snapOf(inbox())), "synced");
    w.screen = signIn();
    assert.equal(s.checkpoint(snapOf(signIn())), "sign-in: email");
  });

  test("opens the app from the Dock while it has no window, at most every 10 s", async () => {
    const w = new World();
    let looks = 0;
    w.tick = () => {
      if (++looks === 20) w.screen = inbox();
    };
    const { s } = session(w);
    assert.equal(await s.toGoal("synced"), true);
    const opens = w.calls.filter((c) => c === "start open /Applications/Example.app");
    assert.ok(opens.length >= 2 && opens.length <= 3, String(opens.length));
    assert.equal(s.watch.states[0]!.label, "no window");
  });

  test("in a dismiss detour, pushes each dialog on the path away as it goes, with or without a window", async () => {
    const w = new World();
    w.path = [welcome(), inbox()];
    w.onKey = () => (w.screen = w.path.shift() ?? w.screen);
    w.onStart = () => (w.screen = w.path.shift() ?? w.screen);
    const { s, step } = session(w);
    await s.run(DETOURS.find((d) => d.id === "dismiss-escape")!);
    assert.equal(step("dismiss-escape-1")!.ok, true);
    assert.equal(step("synced")!.ok, true);
  });

  test("fails a path that never reaches synced within its limit, naming where it stopped", async () => {
    const w = new World();
    w.screen = signIn();
    const { s, step } = session(w);
    assert.equal(await s.toGoal("signed-in", { limitMs: 5000 }), false);
    assert.match(step("signed-in")!.evidence, /^not signed in and synced within 5 s \(signed in: false; synced: false\); last: sign-in: email; Sign in; ways forward: Sign in$/);
    assert.equal(s.timings[0]!.ok, false);
    assert.equal(s.finish("signed-in"), false, "a failed step fails the session, though the watch saw no violation");
    assert.deepEqual(s.watch.violations, []);
  });

  test("names the last state with no heading and no way forward, and an unknown sign-in when it never looked", async () => {
    const w = new World();
    w.screen = blank(null);
    const { s, step } = session(w);
    assert.equal(await s.toGoal("synced", { limitMs: 1000 }), false);
    assert.match(step("synced")!.evidence, /signed in: unknown; .*last: blank; no heading; ways forward: none$/);
    const never = session(new World());
    assert.equal(await never.s.toGoal("synced", { limitMs: 0 }), false);
    assert.match(never.step("synced")!.evidence, /signed in: unknown; synced: false\); last: $/);
  });

  test("calls the detour once at the first arrival at each checkpoint, before the path goes on", async () => {
    const w = new World();
    w.screen = signIn();
    w.path = [inbox()];
    const seen: string[] = [];
    const { s, notes } = session(w);
    assert.equal(await s.toGoal("synced", { detour: async (cp) => void seen.push(cp) }), true);
    assert.deepEqual(seen, ["sign-in: email", "synced"]);
    assert.deepEqual(notes, ["synced: checkpoint", "synced: checkpoint"]);
  });

  test("treats a window too small to be the app's as no window", async () => {
    const w = new World();
    w.screen = { rows: [[0, "AXWindow", "Tiny", { x: 0, y: 0, w: 100, h: 100 }]], signedIn: null };
    const { s } = session(w);
    const look = await s.look();
    assert.ok(look && look.windows.length === 1);
    assert.equal(s.watch.states.at(-1)!.label, "no window");
  });

  test("judges nothing while quiet, and only looks again after its gap", async () => {
    const w = new World();
    w.screen = blank();
    const { s } = session(w);
    s.quiet = true;
    await s.look();
    assert.equal(s.watch.states.length, 0);
    s.quiet = false;
    await s.observe();
    await s.observe();
    assert.equal(w.calls.filter((c) => c.startsWith("run screencapture")).length, 1);
    w.now += 2000;
    await s.observe();
    assert.equal(w.calls.filter((c) => c.startsWith("run screencapture")).length, 2);
  });

  test("writes a failure's picture and tree, and logs it, when a state stays blank past its limit", async () => {
    const w = new World();
    w.screen = blank();
    w.shoot = false;
    const { s, logs, gate } = session(w);
    await s.look();
    w.now = 6000;
    await s.look();
    assert.deepEqual(s.watch.violations.map((v) => v.rule), ["blank", "dead-end"].slice(0, s.watch.violations.length));
    assert.match(logs[0]!, /^gate: blank — the main pane shows nothing to read and no progress state \(state "the main pane", 6 s from 0 s\)$/);
    assert.ok(fs.existsSync(path.join(gate, "fail-01-blank.txt")));
    assert.ok(!fs.existsSync(path.join(gate, "fail-01-blank.png")), "no screenshot, no picture");
  });

  test("runs on this machine unless given another, and names a state of no letters 'state'", async () => {
    const w = new World();
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "first-run-session-"));
    const report = { step: () => {}, note: () => {}, log: () => {}, at: () => 0 };
    assert.equal(new FirstRunSession({ out, eyes: w.eyes, app: app(w), report }).sys, system);
    w.screen = screen([[0, "AXHeading", "…"], [0, "AXButton", "Sign in"]], { signedIn: false });
    const { s, gate } = session(w);
    await s.look();
    assert.deepEqual(fs.readdirSync(path.join(gate, "states")).filter((f) => f.endsWith(".txt")), ["01-state.txt"]);
  });

  test("finds the app's process by name, with or without a window", () => {
    const w = new World();
    const { s } = session(w);
    w.pgrep = "123\n456\n";
    assert.equal(s.processPid(), 123);
    w.pgrep = "";
    assert.equal(s.processPid(), 0);
  });
});

describe("first-run harness: dialogs pushed away", () => {
  test("pushes each new dialog away once with Escape and judges what it left: the way forward behind it passes", async () => {
    const w = new World();
    w.screen = welcome([[0, "AXStaticText", "Getting your chats…"]]);
    w.onKey = (name) => {
      if (name === "escape") w.screen = screen([[0, "AXStaticText", "Getting your chats…"]], { signedIn: null });
    };
    const { s, step } = session(w);
    s.dismiss = "escape";
    const look = (await s.look())!;
    await s.probe(look);
    await s.probe(look);
    assert.equal(w.calls.filter((c) => c === "key escape").length, 1);
    assert.equal(step("dismiss-escape-1")!.ok, true);
    assert.match(step("dismiss-escape-1")!.evidence, /^Escape on "Welcome, Ada": escape took "Welcome, Ada" away, and what it left still offers the way: under way: Getting your chats…$/);
    assert.deepEqual(s.dismissals.map((d) => [d.method, d.ok, d.dismissed]), [["escape", true, true]]);
  });

  test("fails a dismissal that leaves a blank page, and one whose pixels were one shade past the bar, with the reads", async () => {
    const w = new World();
    w.screen = welcome();
    w.onPress = (label) => {
      if (label === "Close") w.screen = blank();
      return { ok: true };
    };
    w.reads = [{ at: 0, uniform: 0.5 }, { at: 100, uniform: 1 }, { at: 900, uniform: 1 }, { at: 1000, uniform: 0.4 }];
    const { s, step, gate } = session(w);
    await s.probe((await s.look())!, "close");
    const evidence = step("dismiss-close-1")!.evidence;
    assert.equal(step("dismiss-close-1")!.ok, false);
    assert.match(evidence, /^its "Close" button on "Welcome, Ada": close took "Welcome, Ada" away onto a blank pane: the page behind it was one shade for 900 ms \(the bar is 500 ms\), from 0\.1 s after its "Close" button; then the main pane shows nothing/);
    assert.match(evidence, /\(4 pixel reads over 3 s\)$/);
    assert.match(fs.readFileSync(path.join(gate, "dismiss-close-1-FAIL.txt"), "utf8"), /pixel reads of the page behind \(ms after its "Close" button, share of one shade\): 0:0\.5 100:1 900:1 1000:0\.4/);
  });

  test("fails a blank flash past the bar though the state after it passes", async () => {
    const w = new World();
    w.screen = welcome();
    w.onKey = () => (w.screen = inbox());
    w.reads = [{ at: 0, uniform: 1 }, { at: 700, uniform: 0.3 }];
    const { s, step } = session(w);
    await s.probe((await s.look())!, "escape");
    assert.match(step("dismiss-escape-1")!.evidence, /one shade for 700 ms \(the bar is 500 ms\), from 0 s after Escape \(2 pixel reads/);
  });

  test("passes a dialog that holds, a close with no close control, and a dialog that fills the window", async () => {
    const w = new World();
    w.screen = welcome();
    w.reads = [];
    const { s, step } = session(w);
    await s.probe((await s.look())!, "escape");
    assert.equal(step("dismiss-escape-1")!.evidence, `Escape on "Welcome, Ada": escape left "Welcome, Ada" up`);
    w.screen = screen([], { signedIn: true, dialog: [[0, "AXHeading", "Terms"], [0, "AXButton", "Accept"]] });
    await s.probe((await s.look())!, "close");
    assert.equal(step("dismiss-close-2")!.evidence, `"Terms" has no close control to press`);
    w.screen = screen([], { signedIn: true, dialog: [[0, "AXHeading", "Setup"]], dialogRect: { x: 0, y: 40, w: 1024, h: 728 } });
    await s.probe((await s.look())!, "outside");
    assert.equal(step("dismiss-outside-3")!.evidence, `"Setup" fills the window, so there is nowhere outside it to click`);
    assert.deepEqual(s.dismissals.map((d) => d.dismissed), [false, false, false]);
  });

  test("clicks outside a dialog with no place as one at the window's corner", async () => {
    const w = new World();
    w.screen = screen([], { signedIn: true, dialog: [[0, "AXHeading", "Hi"]], dialogRect: { x: undefined, y: undefined, w: 400, h: 300 } });
    const { s } = session(w);
    await s.probe((await s.look())!, "outside");
    assert.ok(w.calls.includes("click 712,150"), w.calls.join("; "));
  });

  test("clicks outside a dialog in the widest margin, and judges a window that closed as left up", async () => {
    const w = new World();
    w.screen = welcome();
    w.onClick = () => (w.screen = null);
    const { s, step } = session(w);
    await s.probe((await s.look())!, "outside");
    assert.ok(w.calls.includes("click 128,350"));
    assert.equal(step("dismiss-outside-1")!.evidence, `a click outside it at 128,350 on "Welcome, Ada": outside left "Welcome, Ada" up`);
  });

  test("does nothing with no dismiss method or no dialog, and pushes an alert away with no main window behind it", async () => {
    const w = new World();
    w.screen = inbox();
    const { s, steps } = session(w);
    await s.probe((await s.look())!);
    await s.probe((await s.look())!, "escape");
    assert.equal(steps.length, 0);
    w.screen = { rows: [[0, "AXWindow", "Alert", { x: 0, y: 0, w: 150, h: 100, subrole: "AXDialog" }], [1, "AXStaticText", "Quit?"]], signedIn: null };
    await s.probe((await s.look())!, "escape");
    assert.equal(s.dismissals[0]!.dialog, "Alert");
    w.screen = { rows: [[0, "AXWindow", "Delete?", { x: 0, y: 0, w: 150, h: 100, subrole: "AXDialog" }], [1, "AXStaticText", "Delete?"]], signedIn: null };
    await s.probe((await s.look())!, "outside");
    assert.equal(steps.at(-1)!.evidence, `"Delete?" has no window behind it, so there is nowhere outside it to click`);
    assert.ok(!w.calls.some((c) => c.startsWith("click")));
  });

  test("holds the sync from signed in until the first dismissal is judged, once, and lets it go when no dialog comes", async () => {
    const w = new World();
    w.screen = inbox(false);
    const { s, step, notes } = session(w, { syncNetwork: network });
    s.dismiss = "escape";
    await s.look();
    assert.equal(step("sync-held")!.ok, true);
    assert.match(step("sync-held")!.evidence, /^the sync held, its requests left hanging \(1 address ranges refused\): https:\/\/login\.example\.test\/health can't be reached before the data starts/);
    assert.ok(w.calls.includes("run sudo -n pfctl -a com.apple/ouro-first-run -f -"));
    w.now += LIMITS.syncHoldMs + 1;
    await s.look();
    assert.deepEqual(notes, ["sync released"]);
    await s.look();
    assert.equal(s.dismissals.length, 0);
    assert.equal(w.calls.filter((c) => c.startsWith("run dscacheutil") || c === "run sudo -n pfctl -E").length, 1, "held once");
  });

  test("holds the sync at the app's own checkpoint, and releases it when the dismissal is judged", async () => {
    const w = new World();
    w.screen = welcome();
    w.screen.signedIn = false;
    w.screen.cp = "sign-in: last";
    w.onKey = () => (w.screen = inbox());
    const { s, notes, step } = session(w, { syncNetwork: network, holdSyncAt: (cp) => cp === "sign-in: last" });
    s.dismiss = "escape";
    await s.observe(0);
    assert.equal(step("sync-held")!.ok, true, "held at the app's checkpoint, though not yet signed in");
    assert.deepEqual(notes, ["sync released"]);
    const ow = new World();
    ow.screen = inbox(false);
    const other = session(ow, { syncNetwork: network, holdSyncAt: () => false });
    other.s.dismiss = "escape";
    await other.s.look();
    assert.equal(other.step("sync-held"), undefined, "signed in, but not at the app's checkpoint");
  });
});

describe("first-run harness: what an action left", () => {
  test("passes once the state passes every rule, and keeps it", async () => {
    const w = new World();
    w.screen = inbox();
    const { s, step, gate } = session(w);
    assert.equal(await s.judgeAfter("after-x", "x pressed"), true);
    assert.match(step("after-x")!.evidence, /^x pressed: it left "Inbox", the goal: signed in and synced$/);
    assert.ok(fs.existsSync(path.join(gate, "detour-01-after-x-ok.txt")));
  });

  test("fails a state that keeps failing, and a window that never came up", async () => {
    const w = new World();
    w.screen = blank(false);
    const { s, step } = session(w);
    assert.equal(await s.judgeAfter("after-y", "y pressed", 2000), false);
    assert.match(step("after-y")!.evidence, /^y pressed: the main pane shows nothing to read and no progress state; a dead end: .*\(2 s after; the window: "the main pane"\)$/);
    w.screen = null;
    assert.equal(await s.judgeAfter("after-z", "z pressed", 1000), false);
    assert.equal(step("after-z")!.evidence, `z pressed: no window came up (1 s after; the window: "no window")`);
  });
});

describe("first-run harness: signed out", () => {
  const spaces = (w: World, screens: (Screen | null)[]): Control[] => screens.map((sc, i) => ({ name: `Space ${i + 1}`, act: async () => void (w.screen = sc) }));

  test("judges each space, the menu bar item and the account button while signed out", async () => {
    const w = new World();
    w.pgrep = "42";
    w.menu = { ok: true, items: [{ title: "Sign in…", enabled: true }, { title: "Quit", enabled: true }] };
    const { s, steps } = session(w, { menuBarItem: 0, accountButton: "Account" });
    const app = s.app as AppConfig & { spaces: Control[] };
    app.spaces = spaces(w, [signedOut(), screen([[0, "AXHeading", "All caught up"]], { signedIn: false }), null]);
    w.onPress = (label) => {
      if (label === "Account") w.screen = signIn();
      return { ok: true };
    };
    await s.stranded("signed-out");
    assert.deepEqual(
      steps.map((x) => [x.name, x.ok]),
      [["signed-out-space-1", true], ["signed-out-space-2", false], ["signed-out-space-3", false], ["signed-out-menu-bar", true], ["signed-out-account", true]],
    );
    assert.match(steps[1]!.evidence, /signed out, yet the window says what a signed-in empty screen says: "All caught up"/);
    assert.equal(steps[2]!.evidence, "no window to read");
    assert.equal(steps[3]!.evidence, `the menu bar item offers "Sign in…"`);
    assert.equal(steps[4]!.evidence, "the account button led to the sign-in page (\"Sign in\") in 0.7 s");
  });

  test("stops at the sign-in page a space leads to, and reads the menu bar's Open against what the window offers", async () => {
    const w = new World();
    const { s, steps } = session(w, { menuBarItem: 0 });
    (s.app as { spaces: Control[] }).spaces = spaces(w, [signIn(), signedOut()]);
    w.menu = { ok: true, items: [{ title: "Open Example", enabled: true }, { title: "Quit", enabled: false }] };
    await s.stranded("out");
    assert.deepEqual(steps.map((x) => x.name), ["out-space-1", "out-menu-bar"]);
    assert.equal(steps[1]!.evidence, `the menu bar item offers no Sign in, only "Open Example", to a window that offers Sign in (its items: Open Example, Quit (disabled))`);
    const none = session(new World(), { menuBarItem: 0, reopen: /^Show/ });
    none.s.app.spaces.length = 0;
    (none.s.eyes as unknown as { extraMenu: () => Promise<unknown> }).extraMenu = async () => ({ ok: true, items: [{ title: "Show", enabled: true }, { title: " ", enabled: true }] });
    await none.s.stranded("out");
    assert.deepEqual([none.steps[0]!.ok, none.steps[0]!.evidence], [false, `the menu bar item offers no Sign in, only "Show", to a window that offers no way to sign in (its items: Show)`]);
  });

  test("offline, any way forward a space offers counts, and a space that can't say whether it is signed in is judged signed out", async () => {
    const w = new World();
    const { s, steps } = session(w, { menuBarItem: 0 });
    (s.app as { spaces: Control[] }).spaces = spaces(w, [screen([[0, "AXHeading", "Nothing new"], [0, "AXButton", "Try again"]], { signedIn: null })]);
    w.menu = { ok: true, items: [{ title: "Open Example", enabled: true }] };
    await s.stranded("offline", { signIn: false });
    assert.deepEqual(steps.map((x) => [x.name, x.ok]), [["offline-space-1", false], ["offline-menu-bar", true]]);
    assert.match(steps[0]!.evidence, /signed out, yet the window says what a signed-in empty screen says: "Nothing new"/);
  });

  test("fails a menu bar item that offers no way in, and one whose menu didn't open", async () => {
    const w = new World();
    const { s, steps } = session(w, { menuBarItem: 1 });
    w.menu = { ok: true, items: [{ title: "Quit", enabled: true }] };
    await s.stranded("x");
    w.menu = { ok: false, items: [], why: "no item 1" };
    await s.stranded("y");
    w.menu = { ok: false, items: [] };
    await s.stranded("z");
    assert.deepEqual(steps.map((x) => x.evidence), [
      "the menu bar item offers no way to sign in (its items: Quit)",
      "the menu bar item's menu didn't open when pressed (no item 1), so nothing there leads to sign-in",
      "the menu bar item's menu didn't open when pressed (no menu appeared under it within 2 s), so nothing there leads to sign-in",
    ]);
  });

  test("reads where the account button leads: the page it is on, no button, a fresh Sign in, signing in, waiting, nothing, nowhere", async () => {
    const run = async (start: Screen | null, after: ((w: World) => void) | null, o: { signIn?: boolean; press?: Answer } = {}) => {
      const w = new World();
      w.screen = start;
      w.onPress = (label) => {
        if (label === "Account*" && after) after(w);
        return o.press ?? { ok: true };
      };
      const { s, steps } = session(w, { accountButton: "Account*" });
      await s.stranded("p", { signIn: o.signIn ?? true });
      return steps.at(-1)!;
    };
    assert.equal((await run(signIn(), null)).evidence, "the window is already on the sign-in page, where the account button leads");
    assert.equal((await run(signedOut(), null, { press: { ok: false } })).evidence, "there was no enabled account button to press");
    assert.match((await run(blank(false), (w) => (w.screen = signedOut()))).evidence, /^the account button led to "Sign in" in 0\.7 s$/);
    assert.equal((await run(blank(false), (w) => (w.screen = screen([[0, "AXTextField", "Email"]], { signedIn: false, cp: "sign-in: email" })))).evidence, `the account button led to the sign-in page ("") in 0.7 s`);
    assert.match((await run(blank(false), (w) => (w.screen = screen([[0, "AXStaticText", "Signing you in…"]], { signedIn: false })))).evidence, /^the account button started signing in: "Signing you in…" in/);
    assert.match((await run(screen([[0, "AXButton", "Try again"]], { signedIn: false }), null, { signIn: false })).evidence, /^the account button waited, beside the window's own "Try again" in 8\.\d s$/);
    assert.equal((await run(signedOut(), null)).evidence, "the account button did nothing: the window was the same 8 s later");
    assert.equal((await run(signedOut(), (w) => (w.screen = blank(false)))).evidence, `the account button led nowhere to sign in within 8 s (the window: the main pane)`);
    assert.equal((await run(signedOut(), (w) => (w.screen = null))).evidence, "the account button led nowhere to sign in within 8 s (the window: gone)");
    assert.equal((await run(null, null, { press: { ok: true } })).evidence, "the account button led nowhere to sign in within 8 s (the window: gone)");
  });

  test("waits out a window still starting before it presses the account button, within the progress limit", async () => {
    const run = async (startsFor: number, drawn: () => Screen | null = signedOut, button = true) => {
      const w = new World();
      const cover = screen([[0, "AXStaticText", "Starting…"]], { signedIn: null });
      w.screen = cover;
      let started = false;
      w.tick = () => {
        if (started || w.now < startsFor) return;
        started = true;
        w.screen = drawn();
      };
      // The cover has no account button; the window's own page, once drawn, has one that leads to Microsoft's page.
      w.onPress = (label) => {
        if (label !== "Account*" || !started || !button) return { ok: false };
        w.screen = screen([[0, "AXTextField", "Email"]], { signedIn: false, cp: "sign-in: email" });
        return { ok: true };
      };
      const { s, steps } = session(w, { accountButton: "Account*" });
      await s.stranded("p", { signIn: false });
      return steps.at(-1)!;
    };
    const late = await run(60_000);
    assert.equal(late.ok, true, late.evidence);
    assert.match(late.evidence, /^the account button led to the sign-in page \(""\) in 0\.7 s$/);
    const stuck = await run(1e9);
    assert.equal(stuck.ok, false);
    assert.match(stuck.evidence, /^there was no enabled account button to press \(after 9\d(\.\d)? s of "Starting…", still under way\)$/);
    // Once started, the window can be on Microsoft's page already, have no account button, or be gone.
    assert.match((await run(5000, signIn, false)).evidence, /^the window is on the sign-in page, where the account button leads, after [56](\.\d)? s of "Starting…"$/);
    assert.match((await run(5000, signedOut, false)).evidence, /^there was no enabled account button to press \(after [56](\.\d)? s of "Starting…"\)$/);
    assert.match((await run(5000, () => null, false)).evidence, /^there was no enabled account button to press \(after [56](\.\d)? s of "Starting…"\)$/);
  });

  test("signs out with the sign-in refused, judges the signed-out app, then signs in again", async () => {
    const w = new World();
    w.screen = inbox();
    w.path = [inbox()];
    const { s, step, notes } = session(w, {
      signOut: async () => {
        w.screen = signedOut();
        w.path = [inbox()];
        return "signed out from the account card";
      },
    });
    w.tick = () => {
      if (w.screen === null) w.screen = inbox();
    };
    await s.signedOutRound();
    assert.match(step("signed-out")!.evidence, /^signed out from the account card; signed out 1 s later$/);
    assert.ok(step("sign-in-lapsed"));
    assert.ok(notes.includes("sign-in network back"));
    assert.equal(step("signed-in-again")!.ok, true);
  });

  test("says when the app stays signed in, or has no way to sign out", async () => {
    const w = new World();
    w.screen = inbox();
    const { s, step } = session(w, { signOut: async () => "pressed Sign out" }, { signOutMs: 3000, syncedMs: 1000 });
    await s.signedOutRound(false);
    assert.equal(step("signed-out")!.evidence, "pressed Sign out, yet still signed in 3 s later");
    const none = session(w, {}, { syncedMs: 1000 });
    await none.s.signedOutRound();
    assert.equal(none.step("signed-out")!.evidence, "no way to sign out");
  });
});

describe("first-run harness: a detour's whole session, and the report", () => {
  test("runs a detour from opening the app, at the checkpoints it names, and writes gate.json", async () => {
    const w = new World();
    w.path = [signIn(), inbox()];
    const at: string[] = [];
    const lifted: string[] = [];
    const d: Detour = {
      id: "mine",
      title: "mine",
      before: async () => () => void lifted.push("lifted"),
      start: async () => void at.push("started"),
      at: (cp) => cp !== "synced",
      run: async (_s, cp) => void at.push(cp),
    };
    const { s, gate, step } = session(w);
    await s.run(d);
    assert.deepEqual(at, ["started", "sign-in: email"]);
    assert.deepEqual(lifted, ["lifted"]);
    assert.ok(s.interruptedAt !== null);
    assert.equal(s.finish("mine"), true);
    const json = JSON.parse(fs.readFileSync(path.join(gate, "gate.json"), "utf8")) as { scenario: string; states: { label: string }[] };
    assert.equal(json.scenario, "mine");
    assert.deepEqual(json.states.map((x) => x.label), ["Sign in", "Inbox"]);
    assert.equal(step("gate-no-blank")!.evidence, "every pane showed something to read or a progress state within 5 s, over 2 states");
    assert.ok(w.calls.includes("stop"));
    assert.ok(!fs.existsSync(path.join(gate, "now.png")));
  });

  test("runs a detour with no checkpoints of its own at every one", async () => {
    const w = new World();
    w.path = [signIn(), inbox()];
    const at: string[] = [];
    const { s } = session(w);
    await s.run({ id: "all", title: "all", run: async (_s, cp) => void at.push(cp) });
    assert.deepEqual(at, ["sign-in: email", "synced"]);
  });

  test("stops a detour whose app never opens, still lifting what it set up", async () => {
    const w = new World();
    const lifted: string[] = [];
    const { s } = session(w);
    await s.run({ id: "x", title: "x", before: async () => () => void lifted.push("lifted") });
    await s.run({ id: "y", title: "y" });
    assert.deepEqual(lifted, ["lifted"]);
    assert.equal(s.watch.states.length, 0);
  });

  test("reports each rule the watch caught, with its first time, and each timing over its limit", async () => {
    const w = new World();
    w.screen = blank(false);
    const { s, steps } = session(w);
    for (const at of [0, 6000, 12_000, 20_000]) {
      w.now = at;
      await s.look();
    }
    w.screen = screen([[0, "AXHeading", "All caught up"], [0, "AXStaticText", "Loading…"]], { signedIn: false });
    for (const at of [21_000, 24_000, 120_000]) {
      w.now = at;
      await s.look();
    }
    s.timings.push({ step: "synced", ms: 200_000, limitMs: 150_000, ok: false });
    assert.equal(s.finish("x"), false);
    const byName = Object.fromEntries(steps.map((x) => [x.name, x]));
    assert.match(byName["gate-no-blank"]!.evidence, /^1 time; first: the main pane shows nothing to read and no progress state, for 6 s from 0 s \(state "the main pane"\)$/);
    assert.match(byName["gate-no-dead-end"]!.evidence, /^1 time; first: a dead end/);
    assert.match(byName["gate-not-stuck"]!.evidence, /^1 time; first: still under way/);
    assert.match(byName["gate-signed-out-truth"]!.evidence, /^1 time; first: signed out, yet/);
    assert.equal(byName["time-synced"]!.evidence, "synced took 200 s, over its 150 s limit");
    const twice = session(w);
    for (const at of [0, 6000]) {
      w.now = at;
      w.screen = blank(true);
      await twice.s.look();
    }
    twice.s.watch.violations.push({ ...twice.s.watch.violations[0]! });
    twice.s.finish("y");
    assert.match(twice.step("gate-no-blank")!.evidence, /^2 times; first:/);
  });
});

describe("first-run harness: the detours", () => {
  const detour = (id: string) => DETOURS.find((d) => d.id === id)!;

  test("lists every detour once, on release candidates or nightly", () => {
    assert.deepEqual([...RELEASE_DETOURS, ...NIGHTLY_DETOURS].sort(), DETOURS.map((d) => d.id).sort());
    assert.deepEqual(DETOURS.filter((d) => d.dismiss).map((d) => d.dismiss), ["escape", "close", "outside"]);
  });

  test("controls: presses each control before the sign-in finishes and judges what it left", async () => {
    const w = new World();
    w.screen = signIn();
    const { s, steps } = session(w, { controls: [{ name: "Inbox", act: async () => void w.calls.push("act Inbox") }] });
    const d = detour("controls");
    assert.equal(d.at!("sign-in: email", s.app), true);
    assert.equal(d.at!("welcome", s.app), false);
    await d.run!(s, "sign-in: email", snapOf(signIn()));
    assert.deepEqual(steps.map((x) => [x.name, x.ok]), [["controls-Inbox-at-sign-in: email", true]]);
    assert.ok(w.calls.includes("act Inbox") && w.calls.includes("key escape"));
  });

  test("controls: the app is activated again after each control, before its Escape, so the Escape goes to the app", async () => {
    const w = new World();
    w.screen = signIn();
    const { s } = session(w, { controls: [{ name: "Inbox", act: async () => void w.calls.push("act Inbox") }] });
    await detour("controls").run!(s, "sign-in: email", snapOf(signIn()));
    const between = w.calls.slice(w.calls.indexOf("act Inbox"), w.calls.indexOf("key escape"));
    assert.ok(between.includes("activate"), `calls between the control and Escape: ${between.join(", ")}`);
  });

  test("quit: quits and opens again, saying when it couldn't quit or the app didn't open", async () => {
    const w = new World();
    w.screen = signIn();
    w.path = [signIn()];
    const { s, steps } = session(w);
    await detour("quit").run!(s, "sign-in: email", snapOf(signIn()));
    assert.deepEqual(steps.map((x) => [x.name, x.ok]), [["quit-at-sign-in: email", true], ["reopened-after-quit-at-sign-in: email", true]]);
    const stuck = session(w, { quit: async () => false, open: async () => false });
    await detour("quit").run!(stuck.s, "welcome", snapOf(welcome()));
    assert.deepEqual(stuck.steps.map((x) => [x.name, x.ok, x.evidence]), [["quit-at-welcome", false, `at "welcome", it was still running after Quit`]]);
  });

  test("reopen: closes the window and opens it from the Dock, then from the menu bar item", async () => {
    const w = new World();
    w.screen = signIn();
    w.pgrep = "42";
    w.menu = { ok: true, items: [{ title: "Open Example", enabled: true }] };
    w.onCloseWindow = () => (w.shown = false);
    w.onStart = () => (w.shown = true);
    w.onExtraPress = () => (w.shown = true);
    const { s, steps } = session(w, { menuBarItem: 0 });
    await detour("reopen").run!(s, "sign-in: email", snapOf(signIn()));
    assert.deepEqual(steps.map((x) => [x.name, x.ok]), [["reopen-dock-at-sign-in: email", true], ["reopen-menu-bar-at-sign-in: email", true]]);
    assert.ok(w.calls.includes("extra-press Open Example"));
  });

  test("reopen: fails a close button that leaves the window, and a menu bar item that can't open it", async () => {
    const w = new World();
    w.screen = signIn();
    const { s, steps } = session(w);
    await detour("reopen").run!(s, "a", snapOf(signIn()));
    assert.deepEqual(steps.map((x) => x.evidence), [`at "a", the window's close button left the window on screen`]);
    assert.equal(w.calls.filter((c) => c === "close-window").length, 2, "pressed again once");
    const m = new World();
    m.screen = signIn();
    m.menu = { ok: true, items: [{ title: "Quit", enabled: true }] };
    let closes = 0;
    m.onCloseWindow = () => (m.shown = ++closes === 1 ? false : true);
    m.onStart = () => (m.shown = true);
    const menu = session(m, { menuBarItem: 0 });
    await detour("reopen").run!(menu.s, "b", snapOf(signIn()));
    assert.equal(menu.steps.at(-1)!.evidence, `at "b", the window's close button left the window on screen`);
    const none = new World();
    none.screen = signIn();
    none.menu = { ok: true, items: [] };
    none.onCloseWindow = () => (none.shown = false);
    none.onStart = () => (none.shown = true);
    const empty = session(none, { menuBarItem: 0 });
    await detour("reopen").run!(empty.s, "c", snapOf(signIn()));
    assert.equal(empty.steps.at(-1)!.evidence, `the window closed at "c", and the menu bar item offers no way to open it (its items: none)`);
    none.menu = { ok: true, items: [{ title: "Quit", enabled: true }] };
    await detour("reopen").run!(empty.s, "d", snapOf(signIn()));
    assert.match(empty.steps.at(-1)!.evidence, /\(its items: Quit\)$/);
  });

  test("reopen: when the menu bar item's menu didn't open, the evidence carries why, not an empty items list", async () => {
    const w = new World();
    w.screen = signIn();
    w.menu = { ok: false, items: [], why: "no item 1" };
    w.onCloseWindow = () => (w.shown = false);
    w.onStart = () => (w.shown = true);
    const { s, steps } = session(w, { menuBarItem: 0 });
    await detour("reopen").run!(s, "f", snapOf(signIn()));
    assert.equal(
      steps.at(-1)!.evidence,
      `the window closed at "f", and the menu bar item's menu didn't open when pressed (no item 1), so nothing there reopens it`,
    );
    w.menu = { ok: false, items: [] };
    w.onCloseWindow = () => (w.shown = false);
    await detour("reopen").run!(s, "g", snapOf(signIn()));
    assert.match(steps.at(-1)!.evidence, /\(no menu appeared under it within 2 s\), so nothing there reopens it$/);
  });

  test("reopen: a window with no process left is already closed", async () => {
    const w = new World();
    w.screen = signIn();
    w.onCloseWindow = () => {};
    const { s, steps } = session(w, { pid: async () => 0 });
    w.onStart = () => {};
    await detour("reopen").run!(s, "e", snapOf(signIn()));
    assert.equal(steps[0]!.name, "reopen-dock-at-e");
  });

  test("decline: answers a dialog's question No, and passes a state with no dialog or no No", async () => {
    const w = new World();
    const ask = screen([], { signedIn: false, dialog: [[0, "AXHeading", "Stay signed in?"], [0, "AXButton", "No"], [0, "AXButton", "Yes"]] });
    w.screen = ask;
    w.onPress = (label) => {
      if (label === "No") w.screen = signIn();
      return { ok: true };
    };
    const { s, steps } = session(w);
    const d = detour("decline");
    assert.equal(d.staySignedIn, false);
    await d.run!(s, "kmsi", snapOf(ask));
    await d.run!(s, "sign-in", snapOf(signIn()));
    await d.run!(s, "welcome", snapOf(screen([], { dialog: [[0, "AXHeading", "Hi"]] })));
    assert.deepEqual(steps.map((x) => [x.name, x.ok]), [["decline-at-kmsi", true]]);
    const own = session(w, { decline: /^Nope$/ });
    await d.run!(own.s, "kmsi", snapOf(ask));
    assert.equal(own.steps.length, 0);
  });

  test("cancel-sign-in: Escape on the sign-in page, then its Back or Cancel", async () => {
    const w = new World();
    const page = screen([[0, "AXHeading", "Sign in"], [0, "AXButton", "Back"], [0, "AXButton", "Cancel"]], { signedIn: false, cp: "sign-in: email" });
    w.screen = page;
    const { s, steps } = session(w);
    const d = detour("cancel-sign-in");
    assert.equal(d.at!("sign-in: email", s.app), true);
    await d.run!(s, "sign-in: email", snapOf(page));
    assert.deepEqual(steps.map((x) => x.name), ["cancel-escape-at-sign-in: email", "cancel-back-at-sign-in: email"]);
    const own = session(w, { cancelSignIn: ["Abort"] });
    await d.run!(own.s, "sign-in: email", snapOf(page));
    assert.deepEqual(own.steps.map((x) => x.name), ["cancel-escape-at-sign-in: email"]);
  });

  test("deny-permissions: denies the system's question, or says it asked nothing", async () => {
    const w = new World();
    w.screen = inbox();
    w.pgrep = "99";
    let presses = 0;
    w.onPress = (label) => ({ ok: label === "Deny" && ++presses > 0 });
    const { s, step } = session(w, { askPermission: async () => "notifications" });
    const d = detour("deny-permissions");
    await d.run!(s, "inbox", snapOf(inbox()));
    assert.equal(step("deny-notifications-at-inbox")!.evidence, `notifications: the system asked, and UserNotificationCenter's "Deny" answered it`);
    assert.equal(step("after-deny-notifications-at-inbox")!.ok, true);
    w.pgrep = "";
    const quiet = session(w, { askPermission: async () => "files" });
    await d.run!(quiet.s, "inbox", snapOf(inbox()));
    assert.equal(quiet.step("deny-files-at-inbox")!.evidence, "files: the system asked nothing within 10 s (already decided on this machine), so there was nothing to deny");
    const none = session(w, { askPermission: async () => null });
    await d.run!(none.s, "inbox", snapOf(inbox()));
    const never = session(w);
    await d.run!(never.s, "inbox", snapOf(inbox()));
    assert.equal(none.steps.length + never.steps.length, 0);
  });

  test("offline: holds everything the app reaches, or the whole machine, judges the window, then lets the network back", async () => {
    const w = new World();
    w.screen = screen([[0, "AXHeading", "You're offline"], [0, "AXButton", "Try again"]], { signedIn: false });
    const d = detour("offline");
    const offlineScreen = w.screen;
    const { s, step, notes } = session(w, { network, spaces: [{ name: "Inbox", act: async () => void (w.screen = offlineScreen) }] }, { offlineMs: 3000, strandedSettleMs: 1000 });
    const lift = await d.before!(s);
    assert.match(step("offline")!.evidence, /^offline: everything the app reaches unreachable \(1 address ranges refused\)/);
    await d.start!(s);
    assert.equal(step("offline-inbox")!.ok, true, "offline, the window's Try again is its way forward");
    assert.ok(notes.includes("network back"));
    assert.ok(!w.calls.includes("run sudo -n pfctl -a com.apple/ouro-first-run -F all"));
    (lift as () => void)();
    assert.ok(w.calls.includes("run sudo -n pfctl -a com.apple/ouro-first-run -F all"));
    const whole = session(w);
    await d.before!(whole.s);
    assert.match(whole.step("offline")!.evidence, /^offline: https:\/\/login\.example\.test\/health can't be reached$/);
  });
});
