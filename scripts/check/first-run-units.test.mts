import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildEyes, Eyes, snapshot, treeText } from "../../registry/ouro/check/first-run-eyes.ts";
import {
  closeControl,
  DEFAULT_VOCABULARY,
  dialogLabel,
  dialogs,
  forwardActions,
  judgeAfterDismiss,
  judgeDeadEnd,
  judgeNotBlank,
  judgeSignedOut,
  longestBlank,
  mainRect,
  mainWindow,
  outsidePoint,
  pageIndicator,
  pane,
  progressOf,
  StateWatch,
  subtree,
  timed,
  type AxNode,
  type AxWindow,
  type Snapshot,
  type Vocabulary,
} from "../../registry/ouro/check/first-run-judges.ts";
import { dataPaths, leftovers, loginItemsOn, reset, type App } from "../../registry/ouro/check/first-run-machine.ts";
import { offline, reachable, RESOLVE_MS, unreachable } from "../../registry/ouro/check/first-run-network.ts";
import { system, type System } from "../../registry/ouro/check/first-run-system.ts";

// The first-run harness's units, each driven with made-up accessibility trees, a made-up machine (a `System` that records
// what it was asked and answers from a script) and a made-up eyes process speaking the line protocol.

const root = fileURLToPath(new URL("../..", import.meta.url));
const scratch = join(root, ".tmp", `first-run-${process.pid}`);
mkdirSync(scratch, { recursive: true });
after(() => rmSync(scratch, { recursive: true, force: true }));
let made = 0;
const folder = (name: string) => {
  const dir = join(scratch, `${name}-${++made}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

type Result = { status: number | null; stdout: string; stderr: string };
type Call = { cmd: string; args: string[]; input?: string; timeout?: number };

/** A machine that records each command and answers from `answer` (status 0 and no output unless it says otherwise). */
function machine(answer: (cmd: string, args: string[]) => Partial<Result> = () => ({})) {
  const calls: Call[] = [];
  const sys: System = {
    run(cmd, args, o = {}) {
      calls.push({ cmd, args, ...o });
      return { status: 0, stdout: "", stderr: "", ...answer(cmd, args) };
    },
    start() {},
    sleep: async () => {},
  };
  return { sys, calls, lines: () => calls.map((c) => [c.cmd, ...c.args].join(" ")) };
}

/** Runs `fn` with an empty PATH, so the real machine finds no command (curl, sudo, swiftc, screencapture) and changes nothing. */
function noCommands<T>(fn: () => T): T {
  const path = process.env.PATH;
  process.env.PATH = folder("empty-path");
  try {
    return fn();
  } finally {
    process.env.PATH = path;
  }
}

type Spec = [depth: number, role: string, words?: string, extra?: Partial<AxNode>];
function snap(rows: Spec[], o: Partial<Snapshot> = {}): Snapshot {
  const parents: number[] = [];
  const nodes = rows.map(([d, role, words, extra], i) => {
    parents[d] = i;
    return { i, p: d === 0 ? -1 : parents[d - 1]!, d, role, words, enabled: true, x: 100, y: 100, w: 200, h: 40, ...extra } as AxNode;
  });
  return { at: 0, windows: [{ title: "App", x: 0, y: 0, w: 1024, h: 768, nodes }], signedIn: null, ...o };
}
const shell = (main: Spec[], o: Partial<Snapshot> = {}) =>
  snap(
    [
      [0, "AXWindow", "App", { w: 1024, h: 768, x: 0, y: 0 }],
      [1, "AXToolbar"],
      [2, "AXButton", "Account"],
      [1, "AXWebArea", undefined, { w: 1000, h: 700 }],
      [2, "AXButton", "Activity"],
      [2, "AXButton", "Chat"],
      [2, "AXGroup", undefined, { subrole: "AXLandmarkMain", x: 80, y: 80, w: 900, h: 600 }],
      ...main.map(([d, ...r]) => [d + 3, ...r] as Spec),
    ],
    o,
  );
const welcome = (lines: Spec[]) =>
  snap([
    [0, "AXWindow", "App", { w: 1024, h: 768, x: 0, y: 0 }],
    [1, "AXWebArea", undefined, { w: 1000, h: 700 }],
    [2, "AXGroup", undefined, { subrole: "AXApplicationDialog", x: 256, y: 100, w: 512, h: 586 }],
    [3, "AXHeading", "Welcome, Ada"],
    ...lines,
  ]);
const node = (role: string, extra: Partial<AxNode> = {}): AxNode => ({ i: 0, p: -1, d: 0, role, enabled: true, x: 0, y: 0, w: 100, h: 40, ...extra });

const VOCABULARY: Vocabulary = {
  forward: /^(Sign in|Retry|Continue|Skip, and open the app now)$/i,
  progress: /(…|\.\.\.)$|^(Loading|Getting)\b/i,
  emptyWhileSignedIn: /All caught up|Nothing new/i,
  close: /^(Close|×)$/i,
};

describe("first-run harness: the judges", () => {
  test("the blank main a dismissed loading dialog left is blank and a dead end, naming the controls it offers", () => {
    const s = shell([]);
    const blank = judgeNotBlank(s, VOCABULARY);
    assert.equal(blank.ok, false);
    assert.equal(blank.evidence, "the main pane shows nothing to read and no progress state");
    const dead = judgeDeadEnd(s, { vocabulary: VOCABULARY });
    assert.equal(dead.ok, false);
    assert.equal(dead.place, "dead-end");
    assert.match(dead.evidence, /the controls here: .*Activity, Chat/);
  });

  test("a line saying the app is getting the chats is neither blank nor a dead end", () => {
    const s = shell([[0, "AXStaticText", "Getting your chats…"]]);
    assert.deepEqual(judgeNotBlank(s, VOCABULARY), { ok: true, evidence: "the main pane shows a progress state: Getting your chats…", progress: "Getting your chats…" });
    const dead = judgeDeadEnd(s, { vocabulary: VOCABULARY });
    assert.equal(dead.ok, true);
    assert.equal(dead.place, "progress");
    assert.equal(dead.evidence, "under way: Getting your chats…");
  });

  test("a progress bar beside the main landmark, as a sign-in form shows while it checks an account, keeps a page from being a dead end, and without it the page is one (#2351)", () => {
    const signIn = (bar: Spec[]) =>
      snap([
        [0, "AXWindow", "App", { w: 1024, h: 768, x: 0, y: 0 }],
        [1, "AXWebArea", undefined, { w: 1000, h: 700 }],
        [2, "AXGroup", undefined, { subrole: "AXLandmarkMain", x: 80, y: 80, w: 900, h: 500 }],
        [3, "AXTextField", "ari@example.com"],
        [3, "AXButton", "Next", { enabled: false }],
        ...bar,
      ]);
    const waiting = judgeDeadEnd(signIn([[2, "AXProgressIndicator", "Please wait", { x: 80, y: 600, w: 440, h: 6 }]]), { vocabulary: VOCABULARY });
    assert.equal(waiting.ok, true);
    assert.equal(waiting.place, "progress");
    assert.equal(waiting.evidence, "under way: a progress indicator (Please wait)");
    assert.equal(judgeDeadEnd(signIn([]), { vocabulary: VOCABULARY }).place, "dead-end");
    // Off the screen past any edge, or too small to see, it shows nothing under way.
    for (const at of [{ x: 2000, y: 600 }, { x: -600, y: 600 }, { x: 80, y: 2000 }, { x: 80, y: -100 }]) {
      assert.equal(judgeDeadEnd(signIn([[2, "AXProgressIndicator", "Please wait", { ...at, w: 440, h: 6 }]]), { vocabulary: VOCABULARY }).place, "dead-end", JSON.stringify(at));
    }
    // A bar the tree gives no position stands at the window's corner, on screen.
    assert.equal(judgeDeadEnd(signIn([[2, "AXProgressIndicator", "Please wait", { w: 440, h: 6 }]]), { vocabulary: VOCABULARY }).place, "progress");
    assert.equal(judgeDeadEnd(signIn([[2, "AXProgressIndicator", "Please wait", { x: 80, y: 600, w: 440, h: 0 }]]), { vocabulary: VOCABULARY }).place, "dead-end");
    // A native main pane with no web area around it has no page to look across.
    const native = snap([
      [0, "AXWindow", "App", { w: 1024, h: 768, x: 0, y: 0 }],
      [1, "AXGroup", undefined, { subrole: "AXLandmarkMain", x: 80, y: 80, w: 900, h: 500 }],
      [2, "AXButton", "Next", { enabled: false }],
      [1, "AXProgressIndicator", "Please wait", { x: 80, y: 600, w: 440, h: 6 }],
    ]);
    assert.equal(judgeDeadEnd(native, { vocabulary: VOCABULARY }).place, "dead-end");
    // With two web areas (a page and a small frame), the bar is looked for in the larger, the page.
    const framed = snap([
      [0, "AXWindow", "App", { w: 1024, h: 768, x: 0, y: 0 }],
      [1, "AXWebArea", undefined, { w: 200, h: 100 }],
      [2, "AXProgressIndicator", "Loading an ad", { x: 10, y: 10, w: 100, h: 6 }],
      [1, "AXWebArea", undefined, { w: 1000, h: 700 }],
      [2, "AXGroup", undefined, { subrole: "AXLandmarkMain", x: 80, y: 80, w: 900, h: 500 }],
      [3, "AXButton", "Next", { enabled: false }],
      [2, "AXProgressIndicator", "Please wait", { x: 80, y: 600, w: 440, h: 6 }],
    ]);
    assert.equal(pageIndicator(framed), "a progress indicator (Please wait)");
    // No window, no page.
    assert.equal(pageIndicator({ at: 0, windows: [], signedIn: null }), null);
  });

  test("signed in, a card the person opened over the app is no dead end, since Escape puts it away; signed out or unknown it still is (#2359)", () => {
    const card = (signedIn: boolean | null) =>
      snap(
        [
          [0, "AXWindow", "App", { w: 1024, h: 768, x: 0, y: 0 }],
          [1, "AXWebArea", undefined, { w: 1000, h: 700 }],
          [2, "AXGroup", undefined, { subrole: "AXLandmarkMain", x: 80, y: 80, w: 900, h: 600 }],
          [3, "AXStaticText", "Your chats"],
          [2, "AXGroup", undefined, { subrole: "AXApplicationDialog", x: 256, y: 100, w: 512, h: 400 }],
          [3, "AXHeading", "Account"],
          [3, "AXStaticText", "ari@example.com"],
        ],
        { signedIn },
      );
    const signedIn = judgeDeadEnd(card(true), { vocabulary: VOCABULARY });
    assert.equal(signedIn.ok, true);
    assert.equal(signedIn.place, "forward");
    assert.equal(signedIn.evidence, 'signed in, a card over the app ("Account"), put away with Escape');
    // Signed in with no card open, the page is judged as any other.
    const bare = snap([[0, "AXWindow", "App", { w: 1024, h: 768, x: 0, y: 0 }], [1, "AXWebArea", undefined, { w: 1000, h: 700 }], [2, "AXStaticText", "Your chats"]], { signedIn: true });
    assert.equal(judgeDeadEnd(bare, { vocabulary: VOCABULARY }).place, "dead-end");
    // A card with no name of its own is still put away.
    const unnamed = snap(
      [
        [0, "AXWindow", "App", { w: 1024, h: 768, x: 0, y: 0 }],
        [1, "AXWebArea", undefined, { w: 1000, h: 700 }],
        [2, "AXGroup", undefined, { subrole: "AXApplicationDialog", x: 256, y: 100, w: 512, h: 400 }],
        [3, "AXImage", undefined, { w: 64, h: 64 }],
      ],
      { signedIn: true },
    );
    assert.equal(judgeDeadEnd(unnamed, { vocabulary: VOCABULARY }).evidence, 'signed in, a card over the app ("a dialog"), put away with Escape');
    assert.equal(judgeDeadEnd(card(false), { vocabulary: VOCABULARY }).place, "dead-end");
    assert.equal(judgeDeadEnd(card(null), { vocabulary: VOCABULARY }).place, "dead-end");
  });

  test("a blank page under the app's own view that says it's signing in is in progress; once that view is gone, or the window is one shade, it's blank and a dead end", () => {
    const start = (view: boolean, uniform: number) =>
      snap(
        [
          [0, "AXWindow", "App", { w: 1024, h: 768, x: 0, y: 0 }],
          [1, "AXWebArea", undefined, { w: 1000, h: 700 }],
          [2, "AXGroup", undefined, { subrole: "AXLandmarkMain", x: 80, y: 80, w: 900, h: 600 }],
          ...(view
            ? ([
                [1, "AXGroup", undefined, { x: 312, y: 284, w: 400, h: 200 }],
                [2, "AXImage", undefined, { w: 64, h: 64 }],
                [2, "AXStaticText", "Signing in…", { w: 160, h: 24 }],
              ] satisfies Spec[])
            : []),
        ],
        { pixels: { uniform, mean: 200 } },
      );
    const drawing = start(true, 0.7);
    const blank = judgeNotBlank(drawing, VOCABULARY);
    assert.equal(blank.ok, true);
    assert.equal(blank.evidence, "the main pane is still drawing under the app's own view, which shows a progress state: Signing in…");
    assert.equal(blank.progress, "Signing in…");
    assert.equal(judgeDeadEnd(drawing, { vocabulary: VOCABULARY }).place, "progress");
    // The view gone and the page still empty: blank, and a dead end.
    const after = start(false, 0.7);
    assert.equal(judgeNotBlank(after, VOCABULARY).ok, false);
    assert.equal(judgeDeadEnd(after, { vocabulary: VOCABULARY }).place, "dead-end");
    // A window of one shade shows no view, whatever its tree says.
    const flat = start(true, 0.9999);
    assert.equal(judgeNotBlank(flat, VOCABULARY).ok, false);
    assert.equal(judgeDeadEnd(flat, { vocabulary: VOCABULARY }).place, "dead-end");
  });

  test("words over a pane of one shade are still blank, but a sparse page is not", () => {
    const words: Spec[] = [[0, "AXStaticText", "Hello"]];
    const flat = judgeNotBlank(shell(words, { pixels: { uniform: 0.9999, mean: 240 } }), VOCABULARY);
    assert.equal(flat.ok, false);
    assert.equal(flat.evidence, 'the main pane draws one shade (100% of it), and its tree lists only "Hello"');
    assert.equal(judgeNotBlank(shell(words, { pixels: { uniform: 0.986, mean: 240 } }), VOCABULARY).ok, true);
    assert.match(judgeNotBlank(shell([], { pixels: { uniform: 1, mean: 0 } })).evidence, /, and draws one shade$/);
  });

  test("a fuller tree over a pane of one shade is trusted over the picture", () => {
    const s = shell([[0, "AXStaticText", "One"], [0, "AXStaticText", "Two"], [0, "AXStaticText", "Three"], [0, "AXStaticText", "Four"]], { pixels: { uniform: 1, mean: 0 } });
    assert.deepEqual(judgeNotBlank(s), { ok: true, evidence: "the main pane shows 4 items (One / Two / Three)", progress: null });
  });

  test("with no window on screen nothing is shown and no control is offered", () => {
    const s: Snapshot = { at: 0, windows: [], signedIn: null };
    assert.deepEqual(judgeNotBlank(s), { ok: false, evidence: "no window on screen", progress: null });
    assert.deepEqual(forwardActions(s), []);
    assert.match(judgeDeadEnd(s).evidence, /\(the controls here: none\)$/);
  });

  test("a dialog is the pane: only its own controls are the way forward", () => {
    const s = welcome([
      [4, "AXStaticText", "Getting your chats…"],
      [4, "AXButton", "Skip, and open the app now"],
      [4, "AXButton", "Close"],
      [2, "AXButton", "Retry"],
    ]);
    assert.deepEqual(forwardActions(s, VOCABULARY), ["Skip, and open the app now"]);
    const p = pane(s);
    assert.equal(p.kind, "dialog");
    assert.equal(p.label, "Welcome, Ada");
    assert.deepEqual(p.rect, { x: 256, y: 100, w: 512, h: 586 });
    assert.equal(closeControl(p.nodes, VOCABULARY), "Close");
    assert.equal(judgeNotBlank(s, VOCABULARY).progress, "Getting your chats…");
  });

  test("a forward control is named by the part of its words that moves the person on, once", () => {
    const s = shell([
      [0, "AXButton", "Account | Sign in"],
      [0, "AXLink", "Sign in"],
      [0, "AXButton", "Continue", { enabled: false }],
      [0, "AXButton", "Retry", { w: 0 }],
      [0, "AXButton", "Retry", { h: undefined }],
      [0, "AXButton"],
      [0, "AXStaticText", "Continue"],
    ]);
    assert.deepEqual(forwardActions(s), ["Sign in"]);
    assert.deepEqual(judgeDeadEnd(s), { ok: true, evidence: "the way forward: Sign in", place: "forward", forward: ["Sign in"] });
  });

  test("the goal is no dead end, whatever is on screen", () => {
    assert.deepEqual(judgeDeadEnd(shell([]), { goal: () => true }), { ok: true, evidence: "the goal: signed in and synced", place: "goal", forward: [] });
  });

  test("signed out, an empty signed-in screen's words fail; signed in or unknown they pass", () => {
    const caughtUp: Spec[] = [[0, "AXStaticText", "All caught up"]];
    assert.deepEqual(judgeSignedOut(shell(caughtUp, { signedIn: false }), VOCABULARY), { ok: false, evidence: 'signed out, yet the window says what a signed-in empty screen says: "All caught up"' });
    assert.deepEqual(judgeSignedOut(shell(caughtUp, { signedIn: true }), VOCABULARY), { ok: true, evidence: "signed in" });
    assert.deepEqual(judgeSignedOut(shell(caughtUp, { signedIn: null }), VOCABULARY), { ok: true, evidence: "sign-in state unknown" });
    assert.equal(judgeSignedOut(shell([[0, "AXStaticText", "All caught up", { w: 0 }]], { signedIn: false })).ok, true);
  });

  test("a signed-out screen that offers Sign in tells the truth and is no dead end", () => {
    const s = shell([[0, "AXHeading", "You're signed out"], [0, "AXButton", "Sign in"]], { signedIn: false });
    assert.deepEqual(judgeSignedOut(s), { ok: true, evidence: "signed out, and nothing on screen claims an empty signed-in state" });
    assert.deepEqual(judgeDeadEnd(s, { vocabulary: VOCABULARY }).place, "forward");
  });

  test("a dismissal that left the dialog up, a blank dead end, or a progress state is judged by what it left", () => {
    const held = judgeAfterDismiss("Welcome, Ada", welcome([]), { vocabulary: VOCABULARY, method: "escape" });
    assert.deepEqual(held, { ok: true, evidence: 'escape left "Welcome, Ada" up', dismissed: false });
    const blank = judgeAfterDismiss("Welcome, Ada", shell([]), { vocabulary: VOCABULARY, method: "escape" });
    assert.equal(blank.ok, false);
    assert.equal(blank.dismissed, true);
    assert.match(blank.evidence, /escape took "Welcome, Ada" away, and what it left fails: the main pane shows nothing/);
    const progress = judgeAfterDismiss("Welcome, Ada", shell([[0, "AXStaticText", "Getting your chats…"]]), { method: "close" });
    assert.deepEqual(progress, { ok: true, evidence: 'close took "Welcome, Ada" away, and what it left still offers the way: under way: Getting your chats…', dismissed: true });
  });

  test("the close control is the dialog's own enabled close button, by its words or its subrole", () => {
    assert.equal(closeControl([node("AXButton", { words: "Done | ×" })], VOCABULARY), "×");
    assert.equal(closeControl([node("AXButton", { subrole: "AXCloseButton", words: "Shut" })]), "Shut");
    assert.equal(closeControl([node("AXButton", { subrole: "AXCloseButton" })]), null);
    assert.equal(closeControl([node("AXButton"), node("AXButton", { words: "Close", enabled: false }), node("AXStaticText", { words: "Close" }), node("AXButton", { words: "Close", h: 0 })]), null);
  });

  test("the point outside a dialog is in its widest margin, clear of the window's top bar", () => {
    const window = { x: 0, y: 0, w: 1024, h: 768 };
    assert.deepEqual(outsidePoint({ x: 256, y: 100, w: 512, h: 586 }, window), { x: 128, y: 393 });
    assert.deepEqual(outsidePoint({ x: 10, y: 100, w: 512, h: 586 }, window), { x: 773, y: 393 });
    assert.deepEqual(outsidePoint({ x: 12, y: 400, w: 1000, h: 356 }, window), { x: 512, y: 230 });
    assert.deepEqual(outsidePoint({ x: 12, y: 70, w: 1000, h: 300 }, window), { x: 512, y: 569 });
    assert.equal(outsidePoint({ x: 0, y: 0, w: 1024, h: 768 }, window), null);
  });

  test("the longest blank runs from the first one-shade read to the next read with something on it", () => {
    const reads = [0.5, 1, 1, 0.5, 1, 1].map((uniform, i) => ({ at: i * 100, uniform }));
    assert.deepEqual(longestBlank(reads), { at: 100, ms: 200 });
    assert.deepEqual(longestBlank([{ at: 0, uniform: 0.5 }, { at: 100, uniform: 1 }, { at: 400, uniform: 1 }]), { at: 100, ms: 300 });
    assert.deepEqual(longestBlank([{ at: 0, uniform: 0.9954 }, { at: 100, uniform: 0.9954 }]), { at: 0, ms: 0 });
    assert.deepEqual(longestBlank([{ at: 0, uniform: 0.9954 }, { at: 100, uniform: 0.9954 }], 0.99), { at: 0, ms: 100 });
    assert.deepEqual(longestBlank([]), { at: 0, ms: 0 });
  });

  test("under a modal dialog the page's content is its main landmark, else the web area less a side rail, else the window", () => {
    const win: Spec = [0, "AXWindow", "App", { x: 0, y: 0, w: 1024, h: 768 }];
    assert.deepEqual(mainRect(shell([])), { x: 80, y: 80, w: 900, h: 600 });
    const railed = snap([
      win,
      [1, "AXWebArea", undefined, { x: 0, y: 0, w: 1000, h: 700 }],
      [1, "AXWebArea", undefined, { x: 0, y: 0, w: 500, h: 300 }],
      [2, "AXGroup", undefined, { subrole: "AXLandmarkNavigation", x: undefined, h: undefined }],
      [2, "AXGroup", undefined, { subrole: "AXLandmarkNavigation", x: 0, h: 700, w: undefined }],
      [2, "AXGroup", undefined, { subrole: "AXLandmarkNavigation", x: 0, y: 0, w: 80, h: 700 }],
      [2, "AXGroup", undefined, { subrole: "AXLandmarkNavigation", x: 0, y: 0, w: 60, h: 700 }],
    ]);
    assert.deepEqual(mainRect(railed), { x: 80, y: 0, w: 920, h: 700 });
    assert.deepEqual(mainRect(snap([win, [1, "AXWebArea", undefined, { x: 0, y: 0, w: 1000, h: 700 }], [2, "AXGroup", undefined, { subrole: "AXLandmarkNavigation", x: 600, w: 80, h: 700 }]])), { x: 0, y: 0, w: 1000, h: 700 });
    assert.deepEqual(mainRect(snap([win, [1, "AXButton", "Open"]])), { x: 0, y: 0, w: 1024, h: 768 });
    assert.equal(mainRect({ at: 0, windows: [], signedIn: null }), null);
  });

  test("the pane is the topmost dialog, else the largest main landmark, else the web area, else the window, else none", () => {
    const win: Spec = [0, "AXWindow", "App", { x: 0, y: 0, w: 1024, h: 768 }];
    assert.equal(pane(welcome([])).kind, "dialog");
    const main = pane(snap([win, [1, "AXGroup", undefined, { subrole: "AXLandmarkMain", x: undefined, y: undefined, w: 300, h: 300 }], [1, "AXGroup", undefined, { subrole: "AXLandmarkMain", w: 900, h: 600 }], [2, "AXStaticText", "Hi"]]));
    assert.deepEqual(main, { kind: "main", nodes: main.nodes, rect: { x: 100, y: 100, w: 900, h: 600 }, label: "the main pane" });
    assert.equal(main.nodes.length, 2);
    const smallMain = pane(snap([win, [1, "AXGroup", undefined, { subrole: "AXLandmarkMain", x: undefined, y: undefined, w: 300, h: 300 }]]));
    assert.deepEqual(smallMain.rect, { x: 0, y: 0, w: 300, h: 300 });
    const web = pane(snap([win, [1, "AXWebArea", undefined, { w: 1000, h: 700 }]]));
    assert.deepEqual([web.kind, web.label], ["web", "the page"]);
    const whole = pane(snap([win, [1, "AXButton", "Open"]]));
    assert.deepEqual([whole.kind, whole.label, whole.rect], ["window", "the window", { x: 0, y: 0, w: 1024, h: 768 }]);
    assert.deepEqual(pane({ at: 0, windows: [], signedIn: null }), { kind: "none", nodes: [], rect: { x: 0, y: 0, w: 0, h: 0 }, label: "no window" });
  });

  test("dialogs are web dialogs, sheets and alert windows, but not the main window itself", () => {
    const s = snap([
      [0, "AXWindow", "App", { x: 0, y: 0, w: 1024, h: 768, subrole: "AXDialog" }],
      [1, "AXSheet", undefined, { w: 400, h: 300 }],
      [2, "AXStaticText", "Save changes?"],
      [1, "AXGroup", undefined, { subrole: "AXApplicationDialog", w: 0 }],
      [1, "AXGroup", undefined, { subrole: "AXLandmarkMain" }],
    ]);
    s.windows.push({ title: "Alert", x: 400, y: 300, w: 300, h: 120, nodes: [{ i: 0, p: -1, d: 0, role: "AXWindow", subrole: "AXDialog", words: "Quit Example?", enabled: true, x: 400, y: 300, w: 300, h: 120 }] });
    const found = dialogs(s);
    assert.deepEqual(found.map((d) => [d.window.title, d.node.role, d.nodes.length]), [["App", "AXSheet", 2], ["Alert", "AXWindow", 1]]);
    assert.equal(pane(s).label, "Quit Example?");
  });

  test("a subtree is the node and the run of deeper nodes after it, and a bad index has none", () => {
    const nodes = snap([[0, "AXWindow"], [1, "AXGroup"], [2, "AXButton"], [1, "AXGroup"]]).windows[0]!.nodes;
    assert.deepEqual(subtree(nodes, 1).map((n) => n.i), [1, 2]);
    assert.deepEqual(subtree(nodes, 3).map((n) => n.i), [3]);
    assert.deepEqual(subtree(nodes, 9), []);
  });

  test("the main window is the largest window on screen, and tiny windows are none", () => {
    const w = (title: string, width: number, height: number): AxWindow => ({ title, x: 0, y: 0, w: width, h: height, nodes: [] });
    assert.equal(mainWindow({ at: 0, windows: [w("tiny", 100, 100), w("medium", 400, 300), w("large", 1024, 768), w("flat", 1000, 140)], signedIn: null })?.title, "large");
    assert.equal(mainWindow({ at: 0, windows: [w("tiny", 100, 100)], signedIn: null }), null);
  });

  test("a dialog's label is its heading, else its own words, else its first text, else a dialog", () => {
    assert.equal(dialogLabel([node("AXGroup", { words: "Own" }), node("AXHeading", { words: "H".repeat(100) })]), "H".repeat(80));
    assert.equal(dialogLabel([node("AXGroup", { words: "Own" }), node("AXHeading")]), "Own");
    assert.equal(dialogLabel([node("AXGroup"), node("AXStaticText"), node("AXStaticText", { words: "Body" })]), "Body");
    assert.equal(dialogLabel([node("AXGroup")]), "a dialog");
    assert.equal(dialogLabel([]), "a dialog");
  });

  test("a progress state is a progress line, else a busy or progress indicator with or without its words", () => {
    assert.equal(progressOf([node("AXBusyIndicator", { words: "Syncing" }), node("AXHeading", { words: " Loading mail " })], DEFAULT_VOCABULARY), " Loading mail ");
    assert.equal(progressOf([node("AXBusyIndicator", { words: "Syncing" })], DEFAULT_VOCABULARY), "a busy indicator (Syncing)");
    assert.equal(progressOf([node("AXProgressIndicator", { w: 0 }), node("AXProgressIndicator")], DEFAULT_VOCABULARY), "a progress indicator");
    assert.equal(progressOf([node("AXButton", { words: "Loading" }), node("AXStaticText", { words: "Hello" })], DEFAULT_VOCABULARY), null);
  });

  test("a step's time is held to its limit", () => {
    assert.deepEqual(timed("launch", 900, 1000), { step: "launch", ms: 900, limitMs: 1000, ok: true });
    assert.deepEqual(timed("launch", 1000, 1000).ok, true);
    assert.deepEqual(timed("launch", 1001, 1000).ok, false);
  });
});

describe("first-run harness: the state watch", () => {
  const blank = (at: number) => shell([], { at });
  const loading = (at: number) => shell([[0, "AXStaticText", "Getting your chats…"]], { at });

  test("a state blank past its limit fails once, and one blank in passing does not", () => {
    const watch = new StateWatch({ vocabulary: VOCABULARY, blankWithinMs: 1000 });
    assert.deepEqual(watch.observe(blank(0)), []);
    assert.deepEqual(watch.observe(loading(500)), []);
    assert.deepEqual(watch.observe(blank(900)), []);
    assert.deepEqual(watch.observe(blank(1800)), []);
    const done = watch.observe(blank(1900));
    assert.deepEqual(done, [{ rule: "blank", at: 900, ms: 1000, state: "the main pane", evidence: "the main pane shows nothing to read and no progress state" }]);
    assert.deepEqual(watch.observe(blank(5000)), []);
    assert.deepEqual(watch.violations, done);
  });

  test("a gap carries nothing over, and two gaps in a row are one gap state", () => {
    const watch = new StateWatch({ vocabulary: VOCABULARY, blankWithinMs: 1000 });
    watch.observe(blank(0));
    watch.gap(500);
    assert.deepEqual(watch.observe(blank(1200)), []);
    assert.deepEqual(watch.observe(blank(2200)).map((v) => [v.rule, v.at]), [["blank", 1200]]);
    watch.gap(3000);
    watch.gap(3500);
    assert.deepEqual(watch.timeline(4000), [
      { label: "the main pane", place: "dead-end", at: 0, ms: 500 },
      { label: "no window", place: "progress", at: 500, ms: 700 },
      { label: "the main pane", place: "dead-end", at: 1200, ms: 1800 },
      { label: "no window", place: "progress", at: 3000, ms: 1000 },
    ]);
  });

  test("a watch that starts with a gap records the gap alone", () => {
    const watch = new StateWatch();
    watch.gap(0);
    assert.deepEqual(watch.timeline(100), [{ label: "no window", place: "progress", at: 0, ms: 100 }]);
  });

  test("a dead end past its limit fails once", () => {
    const watch = new StateWatch({ vocabulary: VOCABULARY, deadEndWithinMs: 100 });
    const hello = (at: number) => shell([[0, "AXStaticText", "Hello there"]], { at });
    assert.deepEqual(watch.observe(hello(0)), []);
    assert.deepEqual(watch.observe(hello(50)), []);
    assert.deepEqual(watch.observe(hello(100)).map((v) => [v.rule, v.at, v.ms]), [["dead-end", 0, 100]]);
    assert.deepEqual(watch.observe(hello(200)), []);
    assert.equal(watch.violations.length, 1);
  });

  test("a progress state with no way forward past its limit is stuck", () => {
    const watch = new StateWatch({ vocabulary: VOCABULARY, progressWithinMs: 100 });
    watch.observe(loading(0));
    const [stuck] = watch.observe(loading(150));
    assert.equal(stuck?.rule, "stuck");
    assert.equal(stuck?.evidence, "still under way with no way forward: under way: Getting your chats…");
    assert.deepEqual(watch.observe(loading(300)), []);
  });

  test("the signed-out lie past its limit fails once, and is noted on its state", () => {
    const watch = new StateWatch({ vocabulary: VOCABULARY, signedOutWithinMs: 100, deadEndWithinMs: 60_000 });
    const lie = (at: number) => shell([[0, "AXStaticText", "All caught up"]], { at, signedIn: false });
    watch.observe(lie(0));
    assert.deepEqual(watch.observe(lie(100)).map((v) => v.rule), ["signed-out"]);
    assert.deepEqual(watch.observe(lie(200)), []);
    assert.match(watch.states[0]!.notes.at(-1)!, /^signed out, yet the window says/);
  });

  test("a state is named by its dialog, else its headings, else its pane, with where it stands", () => {
    const watch = new StateWatch({ vocabulary: VOCABULARY, goal: (s) => s.signedIn === true, blankWithinMs: 1, progressWithinMs: 1, deadEndWithinMs: 1, signedOutWithinMs: 1 });
    assert.deepEqual(watch.key(welcome([[4, "AXButton", "Skip, and open the app now"]])), { key: 'dialog|dialog "Welcome, Ada"|forward|Skip, and open the app now', label: 'dialog "Welcome, Ada"' });
    assert.deepEqual(watch.key(shell([[0, "AXHeading", "Chats"], [0, "AXHeading", "Pinned", { h: 0 }]], { signedIn: true })), { key: "main|Chats|goal|", label: "Chats" });
    watch.observe(shell([], { signedIn: true }));
    assert.equal(watch.states[0]!.place, "goal");
    assert.deepEqual(watch.violations, []);
  });
});

const WINDOW: AxWindow = {
  title: "App",
  x: 0,
  y: 0,
  w: 1024,
  h: 768,
  nodes: [
    { i: 0, p: -1, d: 0, role: "AXWindow", words: "App", enabled: true, x: 0, y: 0, w: 1024, h: 768 },
    { i: 1, p: 0, d: 1, role: "AXGroup", subrole: "AXLandmarkMain", enabled: true, x: 80.4, y: 80.6, w: 900, h: 600 },
  ],
};

/** A made-up eyes: answers the line protocol from a script, remembers every line, and leaves `silent` unanswered. */
function fakeEyes(): string {
  const bin = join(folder("eyes"), "eyes.cjs");
  writeFileSync(
    bin,
    `#!/usr/bin/env node
const WINDOW = ${JSON.stringify(WINDOW)};
const heard = [];
let flaky = 0;
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
require("node:readline").createInterface({ input: process.stdin }).on("line", (line) => {
  heard.push(line);
  const [cmd, ...args] = line.split(" ");
  if (cmd === "tree") return out(args[0] === "1" ? { windows: [WINDOW] } : {});
  if (cmd === "shown") return out(args[0] === "1" ? { windows: [{}] } : { ok: true });
  if (cmd === "extras") return out(args[0] === "1" ? { items: ["Example"] } : {});
  if (cmd === "extra-menu") return out(args[0] === "1" ? { ok: true, items: [{ title: "Quit", enabled: true }] } : { ok: false, why: "no menu" });
  if (cmd === "pixels") {
    const file = args[0];
    if (file.includes("flaky")) return out(flaky++ % 2 ? { ok: false } : { ok: true, uniform: 0.75 });
    if (file.includes("nomean")) return out({ ok: true, uniform: 0.9 });
    if (file.includes("nouniform")) return out({ ok: true });
    if (file.includes("mean")) return out({ ok: true, uniform: 0.25, mean: 120 });
    return out({ ok: false, why: "unreadable" });
  }
  if (cmd === "heard") return out({ ok: true, heard });
  if (cmd === "silent") return;
  if (cmd === "late") return setTimeout(() => out({ ok: true, late: true }), 150);
  if (cmd === "twice") { out({ ok: true }); return out({ ok: true, again: true }); }
  out({ ok: true, line });
});
`,
  );
  chmodSync(bin, 0o755);
  return bin;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("first-run harness: the eyes", () => {
  const bin = fakeEyes();

  test("building the eyes runs swiftc on the tree reader and returns the binary, or says why it did not build", () => {
    const out = join(folder("build"), "bin", "eyes");
    const built = machine();
    assert.equal(buildEyes(out, built.sys), out);
    assert.ok(existsSync(join(out, "..")));
    assert.equal(built.calls[0]!.cmd, "swiftc");
    assert.deepEqual([built.calls[0]!.args[0], built.calls[0]!.args.slice(2), built.calls[0]!.timeout], ["-O", ["-o", out], 300_000]);
    assert.match(built.calls[0]!.args[1]!, /registry\/ouro\/check\/first-run-ax-tree\.swift$/);
    assert.throws(() => buildEyes(out, machine(() => ({ status: 1, stdout: "noise", stderr: "error: no such module" })).sys), /did not build: error: no such module$/);
    assert.throws(() => buildEyes(out, machine(() => ({ status: 1, stdout: "only stdout" })).sys), /did not build: only stdout$/);
    assert.throws(() => noCommands(() => buildEyes(out)), /did not build: $/);
  });

  test("the eyes answer each request in turn over the line protocol", async () => {
    const eyes = new Eyes(bin, machine().sys);
    try {
      assert.deepEqual(await eyes.tree(1), [WINDOW]);
      assert.deepEqual(await eyes.tree(2), []);
      assert.equal(await eyes.shown(1), true);
      assert.equal(await eyes.shown(2), false);
      assert.deepEqual(await eyes.closeWindow(3), { ok: true, line: "close-window 3" });
      assert.deepEqual(await eyes.extras(1), ["Example"]);
      assert.deepEqual(await eyes.extras(2), []);
      assert.deepEqual(await eyes.extraMenu(1), { ok: true, items: [{ title: "Quit", enabled: true }], why: undefined });
      assert.deepEqual(await eyes.extraMenu(2, 1), { ok: false, items: [], why: "no menu" });
      assert.deepEqual(await eyes.extraPress("Quit Example"), { ok: true, line: "extra-press Quit Example" });
      assert.deepEqual(await eyes.press(4, "Sign in"), { ok: true, line: "press 4 Sign in" });
      assert.deepEqual(await eyes.key("cmd-w"), { ok: true, line: "key cmd-w" });
      const [a, b] = await Promise.all([eyes.click(10.4, 20.6), eyes.key("escape")]);
      assert.deepEqual([a, b], [{ ok: true, line: "click 10 21" }, { ok: true, line: "key escape" }]);
    } finally {
      eyes.stop();
    }
  });

  test("the pixels are read as one shade and a mean, the mean is 0 when the eyes leave it out, and an unread picture is none", async () => {
    const eyes = new Eyes(bin, machine().sys);
    try {
      assert.deepEqual(await eyes.pixels("a-mean.png", { x: 1.4, y: 2.6, w: 3, h: 4 }), { uniform: 0.25, mean: 120 });
      assert.deepEqual(await eyes.pixels("a-nomean.png", { x: 0, y: 0, w: 1, h: 1 }), { uniform: 0.9, mean: 0 });
      assert.equal(await eyes.pixels("a-nouniform.png", { x: 0, y: 0, w: 1, h: 1 }), null);
      assert.equal(await eyes.pixels("a-bad.png", { x: 0, y: 0, w: 1, h: 1 }), null);
      const { heard } = await eyes.ask<{ heard: string[] }>("heard");
      assert.equal(heard[0], "pixels a-mean.png 1 3 3 4");
    } finally {
      eyes.stop();
    }
  });

  test("sampling captures the pane's rectangle again and again for its time, keeping each read that came back", async () => {
    const shots = machine();
    const eyes = new Eyes(bin, shots.sys);
    try {
      let t = 0;
      const reads = await eyes.sample({ x: 1.2, y: 2.4, w: 3.4, h: 3.6 }, 45, () => (t += 10), "flaky.png");
      assert.deepEqual(reads, [{ at: 30, uniform: 0.75 }]);
      assert.deepEqual(shots.lines(), ["screencapture -x -R 1,2,3,4 flaky.png", "screencapture -x -R 1,2,3,4 flaky.png"]);
      assert.equal(shots.calls[0]!.timeout, 10_000);
    } finally {
      eyes.stop();
    }
  });

  test("a request with no answer in time is no answer, and an answer that comes after it gave up is dropped", async () => {
    const eyes = new Eyes(bin);
    try {
      assert.deepEqual(await eyes.ask("key escape"), { ok: true, line: "key escape" });
      assert.deepEqual(await eyes.ask("late", 50), { ok: false, why: "no answer" });
      await pause(400);
      assert.deepEqual(await eyes.ask("key tab", 5000), { ok: true, line: "key tab" });
      assert.deepEqual(await eyes.ask("twice"), { ok: true });
      await pause(100);
    } finally {
      eyes.stop();
    }
  });

  test("a request the eyes can't be sent fails, and does not break the queue for the requests before it", async () => {
    const eyes = new Eyes(bin, machine().sys);
    try {
      assert.deepEqual(await eyes.key("tab"), { ok: true, line: "key tab" });
      const stdin = (eyes as unknown as { proc: { stdin: { write: (line: string) => void } } }).proc.stdin;
      const write = stdin.write;
      stdin.write = () => {
        throw new Error("the eyes are gone");
      };
      await assert.rejects(eyes.ask("key escape", 20), /the eyes are gone/);
      await pause(40);
      stdin.write = write;
      assert.deepEqual(await eyes.key("return"), { ok: true, line: "key return" }, "the next request gets its own answer");
    } finally {
      eyes.stop();
    }
  });

  test("a snapshot reads the windows, whether the person is signed in, and the pane's pixels from a screenshot", async () => {
    const dir = folder("shots");
    const eyes = new Eyes(bin, machine().sys);
    try {
      const signedIn = async () => true;
      const writes = machine((cmd, args) => {
        writeFileSync(args.at(-1)!, "png");
        return {};
      });
      const shot = join(dir, "shot-mean.png");
      const s = await snapshot(eyes, 1, { at: () => 42, signedIn, shot, sys: writes.sys });
      assert.deepEqual(s, { at: 42, windows: [WINDOW], signedIn: true, pixels: { uniform: 0.25, mean: 120 } });
      assert.deepEqual(writes.calls, [{ cmd: "screencapture", args: ["-x", shot], timeout: 20_000 }]);
      const { heard } = await eyes.ask<{ heard: string[] }>("heard");
      assert.equal(heard.at(-2), `pixels ${shot} 80 81 900 600`);

      const missing = await snapshot(eyes, 1, { at: () => 1, signedIn: async () => null, shot: join(dir, "missing-mean.png"), sys: machine().sys });
      assert.equal(missing.pixels, null);
      const noWindow = await snapshot(eyes, 0, { at: () => 2, signedIn, shot: join(dir, "empty-mean.png"), sys: writes.sys });
      assert.deepEqual(noWindow, { at: 2, windows: [], signedIn: true, pixels: null });
      assert.deepEqual(await snapshot(eyes, 0, { at: () => 3, signedIn: async () => false }), { at: 3, windows: [], signedIn: false });
      const real = await noCommands(() => snapshot(eyes, 0, { at: () => 4, signedIn, shot: join(dir, "real.png") }));
      assert.equal(real.pixels, null);
    } finally {
      eyes.stop();
    }
  });

  test("the tree as text shows each element's role, state, place, DOM id and classes, and words", () => {
    const deep = Array.from({ length: 32 }, (_, d) => ({ i: d + 3, p: d + 2, d: d + 2, role: "AXGroup", enabled: true }));
    const text = treeText([
      {
        title: "App",
        x: 0,
        y: 0,
        w: 800,
        h: 600,
        nodes: [
          { i: 0, p: -1, d: 0, role: "AXWindow", enabled: true, x: 0, y: 0, w: 800, h: 600, words: "App" },
          { i: 1, p: 0, d: 1, role: "AXGroup", subrole: "AXLandmarkMain", enabled: false, domId: "main", domClass: ["a", "b", "c", "d", "e"], words: "W".repeat(120) },
          { i: 2, p: 0, d: 1, role: "AXButton", enabled: true, domClass: [] },
          ...deep,
        ],
      },
      { title: "Other", x: 1, y: 2, w: 3, h: 4, nodes: [] },
    ]);
    const lines = text.split("\n");
    assert.deepEqual(lines.slice(0, 4), ['window "App" 800x600@0,0', "AXWindow 800x600@0,0 App", `  AXGroup/AXLandmarkMain (disabled) #main .a.b.c.d ${"W".repeat(100)}`, "  AXButton"]);
    assert.equal(lines[4], `${"  ".repeat(2)}AXGroup`);
    assert.equal(lines.at(-3), `${"  ".repeat(30)}AXGroup`);
    assert.deepEqual(lines.slice(-2), ["", 'window "Other" 3x4@1,2']);
  });
});

describe("first-run harness: the network", () => {
  const ANCHOR = "com.apple/ouro-first-run";
  /** A machine whose curl answers from `reach` in turn, and whose pfctl answers from `pf`. */
  const net = (reach: boolean[], pf: { enable?: Partial<Result>; put?: Partial<Result> } = {}) => {
    let n = 0;
    return machine((cmd, args) => {
      if (cmd === "curl") return { status: reach[n++] ? 0 : 28 };
      if (cmd === "dscacheutil") return { stdout: args.at(-1) === "login.example.com" ? "name: login.example.com\nip_address: 1.2.3.4\nip_address: 20.190.128.0\nipv6_address: ::1\n" : "" };
      if (args.includes("-E")) return pf.enable ?? {};
      if (args.includes(ANCHOR) && args.includes("-f")) return pf.put ?? {};
      return {};
    });
  };

  test("a url is reachable when curl gets any answer in 6 s", () => {
    const up = machine();
    assert.equal(reachable("https://example.com", up.sys), true);
    assert.deepEqual(up.lines(), ["curl -sS -o /dev/null -m 6 https://example.com"]);
    assert.equal(reachable("https://example.com", machine(() => ({ status: 6 })).sys), false);
    assert.equal(noCommands(() => reachable("https://example.com")), false);
  });

  test("offline loads the system ruleset when the anchor alone doesn't hold, proves the hold, and lifts with pf's token", () => {
    const m = net([true, false], { enable: { stderr: "pf enabled\nToken : 123\n" } });
    const block = offline("https://login.example.com", m.sys);
    assert.equal(block.ok, true);
    assert.equal(block.evidence, "offline: https://login.example.com can't be reached");
    assert.deepEqual(m.lines(), [
      "sudo -n pfctl -E",
      `sudo -n pfctl -a ${ANCHOR} -f -`,
      "curl -sS -o /dev/null -m 6 https://login.example.com",
      "sudo -n pfctl -f /etc/pf.conf",
      `sudo -n pfctl -a ${ANCHOR} -f -`,
      "curl -sS -o /dev/null -m 6 https://login.example.com",
    ]);
    assert.equal(m.calls[1]!.input, "pass out quick on lo0 all\nblock return out quick all\n");
    assert.equal(m.calls[0]!.input, undefined);
    block.lift();
    assert.deepEqual(m.lines().slice(-2), [`sudo -n pfctl -a ${ANCHOR} -F all`, "sudo -n pfctl -X 123"]);
  });

  test("a hold pf refuses, or one the probe still gets through, proves nothing and says so", () => {
    const refused = net([true, true], { put: { status: 1, stderr: "pfctl: Permission denied\n" } });
    const block = offline("https://login.example.com", refused.sys);
    assert.equal(block.ok, false);
    assert.match(block.evidence, /^offline isn't held: pf refused them \(pfctl: Permission denied\), yet https:\/\/login\.example\.com still answered/);
    block.lift();
    assert.deepEqual(refused.lines().slice(-1), [`sudo -n pfctl -a ${ANCHOR} -F all`]);

    const leaky = net([false, true], { enable: { stdout: "Token : 77" } });
    assert.match(offline("https://x.example", leaky.sys).evidence, /^offline isn't held: pf took the rules, yet https:\/\/x\.example still answered/);
    assert.equal(noCommands(() => offline("https://x.example")).ok, false);
  });

  test("unreachable refuses the network's ranges and its hosts' addresses, v4 and v6, once each", () => {
    const m = net([false, false]);
    const block = unreachable({ hosts: ["login.example.com", "nowhere.example.com"], ranges: ["1.2.3.4", "2603:1006::/40"], probe: "https://login.example.com" }, undefined, undefined, m.sys);
    assert.equal(block.ok, true);
    assert.equal(block.evidence, "the sign-in unreachable (4 address ranges refused): https://login.example.com can't be reached");
    assert.deepEqual(m.lines().slice(0, 2), ["dscacheutil -q host -a name login.example.com", "dscacheutil -q host -a name nowhere.example.com"]);
    assert.equal(m.calls.find((c) => c.input !== undefined)!.input, "block return out quick inet proto { tcp udp } to { 1.2.3.4, 20.190.128.0 }\nblock return out quick inet6 proto { tcp udp } to { 2603:1006::/40, ::1 }\n");
  });

  test("unreachable gives each host's lookup 3 s, holds without one that doesn't answer, and names it", () => {
    const m = machine((cmd, args) => {
      if (cmd === "curl") return { status: 7 };
      if (cmd === "dscacheutil") return args.at(-1) === "slow.example.com" ? { status: null } : { stdout: "ip_address: 1.2.3.4\n" };
      return {};
    });
    const block = unreachable({ hosts: ["login.example.com", "slow.example.com"], ranges: ["20.190.128.0/18"], probe: "https://login.example.com" }, undefined, undefined, m.sys);
    assert.equal(block.ok, true);
    assert.deepEqual(m.calls.filter((c) => c.cmd === "dscacheutil").map((c) => c.timeout), [RESOLVE_MS, RESOLVE_MS]);
    assert.equal(block.evidence, "the sign-in unreachable (2 address ranges refused; slow.example.com not resolved in 3 s): https://login.example.com can't be reached");
  });

  test("unreachable can hang instead of refusing, and holds only the address families it has", () => {
    const input = (o: { hosts: string[]; ranges: string[] }, mode: "refuse" | "hang") => {
      const m = net([false, false]);
      unreachable({ ...o, probe: "https://p.example" }, "the token renewal", mode, m.sys);
      return m.calls.find((c) => c.input !== undefined)!.input;
    };
    assert.equal(input({ hosts: [], ranges: ["10.0.0.0/8"] }, "hang"), "block drop out quick inet proto { tcp udp } to { 10.0.0.0/8 }\n");
    assert.equal(input({ hosts: [], ranges: ["fd00::/8"] }, "refuse"), "block return out quick inet6 proto { tcp udp } to { fd00::/8 }\n");
    assert.equal(input({ hosts: ["nowhere.example.com"], ranges: [] }, "hang"), "\n");
    assert.equal(noCommands(() => unreachable({ hosts: [], ranges: [], probe: "https://p.example" })).ok, false);
  });
});

describe("first-run harness: the machine", () => {
  const dump = [
    "========================",
    " Records for UID 501 : 1",
    "========================",
    " #1:",
    "                 UUID: 1",
    "                 Name: Example",
    "           Identifier: com.example.app",
    "          Disposition: [enabled, allowed, visible, notified]",
    " #2:",
    "                 Name: Example Helper",
    "           Identifier: com.example.app.helper",
    "          Disposition: [disabled, allowed, visible, notified]",
    " #3:",
    "                 Name: Other",
    "           Identifier: com.other.app",
    "          Disposition: [enabled, allowed, visible, notified]",
    " #4:",
    "           Identifier: com.example.app.agent",
    "          Disposition: [enabled]",
    "",
  ].join("\n");

  const app = (dir: string, more: Partial<App> = {}): App => ({ bundle: join(dir, "Applications", "Example.app"), id: "com.example.app", ...more });

  test("an app's data is every folder a Mac keeps under its bundle id, and the folders it names", () => {
    const paths = dataPaths(app("/x", { extraPaths: ["/x/extra"] }), "/home/ada");
    assert.equal(paths.length, 11);
    assert.equal(paths[0], "/home/ada/Library/Application Support/com.example.app");
    assert.equal(paths.at(-1), "/x/extra");
    assert.equal(dataPaths(app("/x"))[0], join(os.homedir(), "Library", "Application Support", "com.example.app"));
  });

  test("an enabled login item for the app is a leftover; a disabled one or another app's is not", () => {
    assert.deepEqual(loginItemsOn(app("/x"), dump), ["Example", "com.example.app"]);
    assert.deepEqual(loginItemsOn(app("/x", { id: "bot.ouro.absent" }), dump), []);
    assert.equal(loginItemsOn(app("/x"), null), null);
  });

  test("the login items are read with passwordless sudo, and unreadable without it", () => {
    const ok = machine(() => ({ stdout: dump.slice(0, 200), stderr: dump.slice(200) }));
    assert.deepEqual(loginItemsOn(app("/x"), undefined, ok.sys), ["Example", "com.example.app"]);
    assert.deepEqual(ok.lines(), ["sudo -n sfltool dumpbtm"]);
    assert.equal(loginItemsOn(app("/x"), undefined, machine(() => ({ status: 1, stderr: "sudo: a password is required" })).sys), null);
  });

  test("a clean machine has no leftovers, and a used one lists each thing it still holds", () => {
    const home = folder("home");
    assert.deepEqual(leftovers(app(home), { home, btm: "" }), []);
    mkdirSync(app(home).bundle, { recursive: true });
    const support = dataPaths(app(home), home)[0]!;
    mkdirSync(support, { recursive: true });
    assert.deepEqual(leftovers(app(home, { keychainItems: () => ["refresh token"] }), { home, btm: dump }), [
      `the app is installed at ${app(home).bundle}`,
      `its data at ${support}`,
      "a keychain item: refresh token",
      "a login item turned on: Example, com.example.app",
    ]);
    assert.match(leftovers(app(home), { home, sys: machine(() => ({ status: 1 })).sys }).at(-1)!, /^sudo -n sfltool dumpbtm answered with an error/);
    assert.equal(noCommands(() => leftovers(app(home, { id: "bot.ouro.first-run-unit-absent" }))).length, 2);
  });

  test("a reset quits the app and takes off its bundle, its data, its keychain items and its defaults", () => {
    const home = folder("home");
    const forgot: string[] = [];
    const used = app(home, { forgetKeychain: () => forgot.push("forgot"), extraPaths: [join(home, "extra")] });
    mkdirSync(join(used.bundle, "Contents"), { recursive: true });
    for (const p of dataPaths(used, home).slice(0, 3)) mkdirSync(p, { recursive: true });
    mkdirSync(join(home, "Library", "Preferences"));
    writeFileSync(dataPaths(used, home)[6]!, "plist");
    mkdirSync(join(home, "extra"));
    const m = machine();
    reset(used, { home, sys: m.sys });
    assert.deepEqual(m.lines(), [`pkill -9 -f ${used.bundle}`, "defaults delete com.example.app"]);
    assert.deepEqual(forgot, ["forgot"]);
    assert.deepEqual(leftovers(used, { home, btm: "" }), []);
    reset(app(home), { home, sys: m.sys });
    assert.equal(m.calls.length, 4);
    noCommands(() => reset(app(home, { id: "bot.ouro.first-run-unit-absent" })));
  });
});

describe("first-run harness: the real machine", () => {
  test("runs a command and reads what it wrote, with its input, and says a missing command has no status", () => {
    assert.deepEqual(system.run(process.execPath, ["-e", "process.stdout.write('hi'); process.stderr.write('ho')"]), { status: 0, stdout: "hi", stderr: "ho" });
    assert.deepEqual(system.run(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], { input: "piped", timeout: 10_000 }), { status: 0, stdout: "piped", stderr: "" });
    assert.deepEqual(system.run("first-run-no-such-command", []), { status: null, stdout: "", stderr: "" });
  });

  test("starts a command and leaves it running, and starting a missing one doesn't throw", async () => {
    system.start(process.execPath, ["-e", ""]);
    system.start("first-run-no-such-command", []);
    await system.sleep(20);
  });
});
