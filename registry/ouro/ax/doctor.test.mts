import { test } from "node:test";
import assert from "node:assert/strict";
import { defineChecks, isChecksReport, type CheckDef } from "#ouro-ax/checks.ts";
import { agoText, DOCTOR_VERSION, doctorReport, doctorText, isDoctorReport, type StateSection } from "#ouro-ax/doctor.ts";
import { stripAnsi, terminalStyle } from "#ouro-ax/terminal.ts";

const PIPE = terminalStyle({}, {});
const TTY = terminalStyle({ isTTY: true }, {});
const AT = Date.UTC(2026, 10, 17, 20, 0, 0);
const min = 60_000;

const state: StateSection[] = [
  {
    id: "processes",
    label: "Processes",
    lines: [
      { label: "App", value: "up, pid 4200", state: "up", since: AT - 43 * min },
      { label: "Engine", value: "starting", state: "starting", since: AT - 40_000 },
      { label: "Service", value: "stuck: took the connection, no answer in 1.5 s", state: "stuck" },
      { label: "Sync", value: "down", state: "down", since: null },
      { label: "Helper", value: "not installed", state: "absent" },
    ],
  },
  { id: "empty", label: "Nothing here", lines: [] },
  { id: "versions", label: "Versions", lines: [{ label: "Chat", value: "0.2.11" }] },
];

const signIn: CheckDef<null> = { id: "sign-in", label: "Sign-in", run: () => ({ state: "failed", detail: "the sign-in page has been open for 3 min", fix: { command: "chat sign-in", why: "Sign in again" } }) };
const window: CheckDef<null> = { id: "window", label: "Window", needs: ["sign-in"], run: () => ({ state: "passed" }) };
const service: CheckDef<null> = { id: "service", label: "Service", run: () => ({ state: "passed" }) };

test("a doctor report is the checks report with the state it judged, and still a checks report", async () => {
  const checks = await defineChecks<null>({ command: "chat doctor", checks: [service, signIn] }).run(null);
  const report = doctorReport(checks, state, AT);
  assert.deepEqual(report, { ...checks, doctor: DOCTOR_VERSION, at: AT, state });
  assert.equal(report.exitCode, checks.exitCode);
  assert.ok(isChecksReport(report) && isDoctorReport(report));
  assert.ok(isDoctorReport(JSON.parse(JSON.stringify(report))), "it survives JSON, as an app's doctor endpoint sends it");
  const sent = '{"ax":"checks/1","doctor":"doctor/1","at":0,"verdict":"passed","summary":"The check passed.","counts":{},"rows":[],"next":[],"exitCode":0,"durationMs":0,"state":[]}';
  assert.ok(isDoctorReport(JSON.parse(sent)), "the wire format names its version doctor/1");
  assert.equal(isDoctorReport(checks), false, "a checks report alone is not a doctor's");
  for (const broken of [{ ...report, doctor: "doctor/2" }, { ...report, at: "now" }, { ...report, state: {} }, { ...report, state: [{ id: "a", label: "A" }] }, { ...report, state: [{ id: "a", lines: [] }] }, { ...report, state: [null] }, { ...report, state: [{ id: "a", label: "A", lines: [{ label: "B" }] }] }, { ...report, state: [{ id: "a", label: "A", lines: [{ value: "up" }] }] }, { ...report, state: [{ id: "a", label: "A", lines: [7] }] }, null, "doctor/1"]) assert.equal(isDoctorReport(broken), false, JSON.stringify(broken));
});

test("agoText says how long ago in a person's words, at each step's edges", () => {
  const ago = (ms: number) => agoText(AT - ms, AT);
  assert.deepEqual(
    [ago(-60_000), ago(0), ago(4_400), ago(5_000), ago(40_000), ago(119_000), ago(120_000), ago(12 * min), ago(119 * min), ago(120 * min), ago(47 * 60 * min), ago(48 * 60 * min), ago(9 * 24 * 60 * min)],
    ["just now", "just now", "just now", "5 s ago", "40 s ago", "119 s ago", "2 min ago", "12 min ago", "119 min ago", "2 h ago", "47 h ago", "2 days ago", "9 days ago"],
  );
});

test("the text leads with the verdict, then the state by section, then the problems and their fixes", async () => {
  const report = doctorReport(await defineChecks<null>({ command: "chat doctor", checks: [service, signIn, window] }).run(null), state, AT);
  const text = doctorText(report, PIPE, { command: "chat doctor" });
  assert.equal(
    text,
    [
      "FAIL 1 of 3 checks failed: Sign-in. 1 passed, 1 not run, in under 0.1s.",
      "  Not run: 1 after an earlier problem",
      "",
      "Processes",
      "  App      up, pid 4200, since 43 min ago",
      "  Engine   starting, since 40 s ago",
      "  Service  stuck: took the connection, no answer in 1.5 s",
      "  Sync     down",
      "  Helper   not installed",
      "",
      "Versions",
      "  Chat     0.2.11",
      "",
      "Found a problem",
      "  FAIL Sign-in",
      "    the sign-in page has been open for 3 min",
      "    Fix: Sign in again",
      "      chat sign-in",
      "",
      "Next",
      "  Check again once it's fixed",
      "    chat doctor",
      "  See every check",
      "    chat doctor --verbose",
    ].join("\n"),
  );
  const coloured = doctorText(report, TTY, { command: "chat doctor" });
  assert.equal(stripAnsi(coloured).split("\n").slice(3, 9).join("\n"), text.split("\n").slice(3, 9).join("\n"));
  const esc = "\u001b[";
  assert.ok(coloured.includes(`${esc}31mstuck: took`), "stuck is red");
  assert.ok(coloured.includes(`${esc}31mdown`), "down is red");
  assert.ok(coloured.includes(`${esc}33mstarting`), "starting is yellow");
  assert.ok(coloured.includes("  App      up, pid 4200"), "up has no colour");
});

test("a passing doctor with nothing to act on prints the verdict, then the state", async () => {
  const report = doctorReport(await defineChecks<null>({ command: "chat doctor", checks: [service] }).run(null), [{ id: "versions", label: "Versions", lines: [{ label: "Chat", value: "0.2.11" }] }], AT);
  assert.equal(doctorText(report, PIPE), "ok The check passed in under 0.1s.\n\nVersions\n  Chat  0.2.11");
  assert.equal(doctorText({ ...report, state: [] }, PIPE), "ok The check passed in under 0.1s.", "no state, no sections");
});
