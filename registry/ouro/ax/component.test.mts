import { test } from "node:test";
import assert from "node:assert/strict";
import { bindAx, defineComponentAx, READ_CONSENTS, type AxAction } from "./component.ts";
import { liveCaptionsAx, mediaTileAx, toolbarAx, ui } from "./fixtures/call-components.mts";

const throwsLine = (fn: () => unknown, line: string) => assert.throws(fn, (e: Error) => e.message === line);

test("an action is agent or person-only, exactly one, and every problem throws one line with its fix", () => {
  assert.deepEqual(READ_CONSENTS, ["none", "listening"]);
  const ok = defineComponentAx({ component: "Pin", reads: [], actions: [{ id: "pin", summary: "Pin.", effect: "private", agent: true }] });
  assert.equal(Object.isFrozen(ok) && Object.isFrozen(ok.actions) && Object.isFrozen(ok.reads), true);
  const act = (a: object) => () => defineComponentAx({ component: "Toolbar", reads: [], actions: [a as AxAction] });
  throwsLine(act({ id: "unmute", summary: "U.", effect: "others" }), 'Toolbar action "unmute": it says neither agent: true nor personOnly. Fix: add agent: true, or personOnly: "<why only the person does it>".');
  throwsLine(act({ id: "unmute", summary: "U.", effect: "others", agent: false }), 'Toolbar action "unmute": it says neither agent: true nor personOnly. Fix: add agent: true, or personOnly: "<why only the person does it>".');
  throwsLine(act({ id: "unmute", summary: "U.", effect: "others", agent: true, personOnly: "no" }), 'Toolbar action "unmute": it says both agent and personOnly. Fix: keep one: agent: true, or personOnly with its reason.');
  throwsLine(act({ id: "unmute", summary: "U.", effect: "others", personOnly: "two\nlines" }), 'Toolbar action "unmute": personOnly needs a one-line reason. Fix: personOnly: "<why only the person does it>".');
  throwsLine(act({ id: "mute", summary: "M.", effect: "public", agent: true }), 'Toolbar action "mute": effect is "public". Fix: effect: "private" or "others".');
  throwsLine(act({ id: "", summary: "M.", effect: "others", agent: true }), 'Toolbar action: an action has no id. Fix: id: "<the action, in a word>".');
  const twice = { id: "mute", summary: "M.", effect: "others", agent: true } as const;
  throwsLine(() => defineComponentAx({ component: "Toolbar", reads: [], actions: [twice, twice] }), 'Toolbar action "mute": the id is used twice. Fix: give each action its own id.');
  const read = (r: object) => () => defineComponentAx({ component: "MediaTile", reads: [r as never], actions: [] });
  throwsLine(read({ name: "", fields: ["name"], consent: "none" }), 'MediaTile read: a read has no name. Fix: name: "<what the agent reads>".');
  throwsLine(read({ name: "participant", fields: [], consent: "none" }), 'MediaTile read "participant": it lists no fields. Fix: fields: ["<a field its twin\'s --json carries>"].');
  throwsLine(read({ name: "participant", fields: ["name"], consent: "always" }), 'MediaTile read "participant": consent is "always". Fix: consent: "none", or "listening" for what people say.');
  throwsLine(read({ name: "captions", fields: ["text"], consent: "listening", push: "all" }), 'MediaTile read "captions": push is "all". Fix: push: "filtered", or leave it out.');
  const r = { name: "participant", fields: ["name"], consent: "none" } as const;
  throwsLine(() => defineComponentAx({ component: "MediaTile", reads: [r, r], actions: [] }), 'MediaTile read "participant": the name is used twice. Fix: give each read its own name.');
  throwsLine(() => defineComponentAx({ component: " ", reads: [], actions: [] }), ` : the component has no name. Fix: component: "<the component's export name>".`);
  // @ts-expect-error neither agent nor personOnly: a type error, not only a runtime one.
  assert.throws(() => defineComponentAx({ component: "T", reads: [], actions: [{ id: "a", summary: "A.", effect: "others" }] }));
  // @ts-expect-error both agent and personOnly.
  assert.throws(() => defineComponentAx({ component: "T", reads: [], actions: [{ id: "a", summary: "A.", effect: "others", agent: true, personOnly: "why" }] }));
});

test("bindAx needs a twin for every read and agent action, refuses one for a person-only action, and returns the inventory entries", () => {
  assert.deepEqual(ui, [
    { component: "MediaTile", kind: "read", id: "participant", twin: "call participants <meeting>", consent: "none", fields: ["name", "muted", "camera", "speaking", "handRaised", "connection"] },
    { component: "MediaTile", kind: "action", id: "pin", effect: "private", twin: "call pin <participant>" },
    { component: "Toolbar", kind: "action", id: "mute", effect: "others", twin: "call mute <meeting>" },
    { component: "Toolbar", kind: "action", id: "leave", effect: "others", twin: "call leave <meeting>" },
    { component: "Toolbar", kind: "action", id: "raise-hand", effect: "others", twin: "call raise-hand <meeting>" },
    { component: "Toolbar", kind: "action", id: "unmute", effect: "others", personOnly: "agents never turn on a person's microphone, camera or screen", refuseAs: "call unmute" },
    { component: "Toolbar", kind: "action", id: "camera", effect: "others", personOnly: "agents never turn on a person's microphone, camera or screen", refuseAs: "call camera" },
    { component: "Toolbar", kind: "action", id: "share", effect: "others", personOnly: "agents never turn on a person's microphone, camera or screen", refuseAs: "call share" },
    { component: "LiveCaptions", kind: "read", id: "captions", twin: "call captions <meeting>", consent: "listening", fields: ["speaker", "text", "at"], push: "call events <meeting> --stream live-transcript", trigger: "--on mention" },
  ]);
  const toolbar = { mute: "call mute <meeting>", leave: "call leave <meeting>", "raise-hand": "call raise-hand <meeting>" };
  assert.deepEqual(bindAx(toolbarAx, { actions: toolbar }).find((e) => e.id === "unmute"), { component: "Toolbar", kind: "action", id: "unmute", effect: "others", personOnly: "agents never turn on a person's microphone, camera or screen" });
  throwsLine(() => bindAx(toolbarAx, { actions: { mute: "call mute" } }), 'Toolbar action "leave": an agent action has no twin. Fix: actions: { "leave": "<the CLI command that does it>" }.');
  throwsLine(() => bindAx(toolbarAx, { actions: { ...toolbar, unmute: "call unmute" } }), 'Toolbar action "unmute": only the person does it (agents never turn on a person\'s microphone, camera or screen), so it has no twin. Fix: move "call unmute" to refuseAs, where its words refuse.');
  throwsLine(() => bindAx(toolbarAx, { actions: toolbar, refuseAs: { mute: "call mute" } }), 'Toolbar action "mute": refuseAs is for a person-only action, and this one is the agent\'s. Fix: bind it under actions, or make it personOnly.');
  throwsLine(() => bindAx(toolbarAx, { actions: toolbar, refuseAs: { unmute: "" } }), 'Toolbar action "unmute": refuseAs is empty. Fix: refuseAs: { "unmute": "<the CLI words an agent might try>" }.');
  throwsLine(() => bindAx(toolbarAx, { actions: { ...toolbar, join: "call join" } }), 'Toolbar action "join": the component declares no such action. Fix: bind one of "mute", "leave", "raise-hand", "unmute", "camera", "share".');
  throwsLine(() => bindAx(liveCaptionsAx, { actions: { pin: "call pin" } }), 'LiveCaptions action "pin": the component declares no such action. Fix: bind one of none.');
  throwsLine(() => bindAx(toolbarAx, { reads: { participant: "call participants" }, actions: toolbar }), 'Toolbar read "participant": the component declares no such read. Fix: bind one of none.');
  throwsLine(() => bindAx(mediaTileAx, { reads: { tile: "call tile" } }), 'MediaTile read "tile": the component declares no such read. Fix: bind one of "participant".');
  throwsLine(() => bindAx(mediaTileAx, { actions: { pin: "call pin" } }), 'MediaTile read "participant": it has no twin. Fix: reads: { "participant": "<the CLI read that gives name, muted, camera, speaking, handRaised, connection>" }.');
  throwsLine(() => bindAx(liveCaptionsAx, { reads: { captions: "call captions" } }), 'LiveCaptions read "captions": it streams, but its stream or trigger is not bound. Fix: reads: { "captions": { read: "call captions", push: "<the stream asked for every line>", trigger: "<the words trigger, such as --on mention>" } }.');
  throwsLine(() => bindAx(liveCaptionsAx, { reads: { captions: { read: "call captions", push: "call events", trigger: "" } } }), 'LiveCaptions read "captions": it streams, but its stream or trigger is not bound. Fix: reads: { "captions": { read: "call captions", push: "<the stream asked for every line>", trigger: "<the words trigger, such as --on mention>" } }.');
  throwsLine(() => bindAx(mediaTileAx, { reads: { participant: { read: "call participants", push: "call events", trigger: "--on mention" } }, actions: { pin: "call pin" } }), 'MediaTile read "participant": a stream is bound, but the read does not declare push. Fix: add push: "filtered" to the read.');
});
