import { test } from "node:test";
import assert from "node:assert/strict";
import { AX_ACTION_ATTRIBUTE, bindAx, defineComponentAx, expectAxRendered, isReservedPersonOnly, READ_CONSENTS, RESERVED_PERSON_ONLY, type AxAction } from "./component.ts";
import { liveCaptionsAx, mediaTileAx, callControlsAx, ui } from "./fixtures/call-components.mts";

const throwsLine = (fn: () => unknown, line: string) => assert.throws(fn, (e: Error) => e.message === line);

test("an action is agent or person-only, exactly one, and every problem throws one line with its fix", () => {
  assert.deepEqual(READ_CONSENTS, ["none", "listening"]);
  const ok = defineComponentAx({ component: "Pin", reads: [], actions: [{ id: "pin", summary: "Pin.", effect: "private", agent: true }] });
  assert.equal(Object.isFrozen(ok) && Object.isFrozen(ok.actions) && Object.isFrozen(ok.reads), true);
  const act = (a: object) => () => defineComponentAx({ component: "CallControls", reads: [], actions: [a as AxAction] });
  throwsLine(act({ id: "unmute", summary: "U.", effect: "others" }), 'CallControls action "unmute": it says neither agent: true nor personOnly. Fix: add agent: true, or personOnly: "You can\'t <do it> for the person; only they can.".');
  throwsLine(act({ id: "unmute", summary: "U.", effect: "others", agent: false }), 'CallControls action "unmute": it says neither agent: true nor personOnly. Fix: add agent: true, or personOnly: "You can\'t <do it> for the person; only they can.".');
  throwsLine(act({ id: "unmute", summary: "U.", effect: "others", agent: true, personOnly: "no" }), 'CallControls action "unmute": it says both agent and personOnly. Fix: keep one: agent: true, or personOnly with its reason.');
  throwsLine(act({ id: "unmute", summary: "U.", effect: "others", personOnly: "two\nlines" }), 'CallControls action "unmute": personOnly needs a one-line reason. Fix: personOnly: "You can\'t <do it> for the person; only they can.".');
  throwsLine(act({ id: "mute", summary: "M.", effect: "public", agent: true }), 'CallControls action "mute": effect is "public". Fix: effect: "private" or "others".');
  throwsLine(act({ id: "", summary: "M.", effect: "others", agent: true }), 'CallControls action: an action has no id. Fix: id: "<the action, in a word>".');
  const twice = { id: "mute", summary: "M.", effect: "others", agent: true } as const;
  throwsLine(() => defineComponentAx({ component: "CallControls", reads: [], actions: [twice, twice] }), 'CallControls action "mute": the id is used twice. Fix: give each action its own id.');
  const read = (r: object) => () => defineComponentAx({ component: "MediaTile", reads: [r as never], actions: [] });
  throwsLine(read({ id: "", fields: ["name"], consent: "none" }), 'MediaTile read: a read has no id. Fix: id: "<what the agent reads, in a word>".');
  throwsLine(read({ id: "participant", fields: [], consent: "none" }), 'MediaTile read "participant": it lists no fields. Fix: fields: ["<a field its twin\'s --json carries>"].');
  throwsLine(read({ id: "participant", fields: ["name"], consent: "always" }), 'MediaTile read "participant": consent is "always". Fix: consent: "none", or "listening" for what people say.');
  throwsLine(read({ id: "captions", fields: ["text"], consent: "listening", push: "all" }), 'MediaTile read "captions": push is "all". Fix: push: "filtered", or leave it out.');
  const r = { id: "participant", fields: ["name"], consent: "none" } as const;
  throwsLine(() => defineComponentAx({ component: "MediaTile", reads: [r, r], actions: [] }), 'MediaTile read "participant": the id is used twice. Fix: give each read its own id.');
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
    { component: "CallControls", kind: "action", id: "mute", effect: "others", twin: "call mute <meeting>" },
    { component: "CallControls", kind: "action", id: "leave", effect: "others", twin: "call leave <meeting>" },
    { component: "CallControls", kind: "action", id: "raise-hand", effect: "others", twin: "call raise-hand <meeting>" },
    { component: "CallControls", kind: "action", id: "lower-hand", effect: "others", twin: "call lower-hand <meeting>" },
    { component: "CallControls", kind: "action", id: "unmute", effect: "others", personOnly: "You can't turn on the person's microphone, camera or screen; only they can.", refuseAs: "call unmute" },
    { component: "CallControls", kind: "action", id: "camera", effect: "others", personOnly: "You can't turn on the person's microphone, camera or screen; only they can.", refuseAs: "call camera" },
    { component: "CallControls", kind: "action", id: "share", effect: "others", personOnly: "You can't turn on the person's microphone, camera or screen; only they can.", refuseAs: "call share" },
    { component: "CallControls", kind: "action", id: "captions", effect: "private", personOnly: "You can't turn the person's captions on or off; only they can.", refuseAs: "call captions on" },
    { component: "LiveCaptions", kind: "read", id: "captions", twin: "call captions <meeting>", consent: "listening", fields: ["speaker", "text", "at"], push: "call events <meeting> --stream live-transcript", trigger: "--on mention" },
  ]);
  const controls = { mute: "call mute <meeting>", leave: "call leave <meeting>", "raise-hand": "call raise-hand <meeting>", "lower-hand": "call lower-hand <meeting>" };
  const refuseAs = { unmute: "call unmute", camera: "call camera", share: "call share", captions: "call captions on" };
  throwsLine(() => bindAx(callControlsAx, { actions: controls }), 'CallControls action "unmute": a person-only action needs the CLI words an agent might try, which refuse. Fix: refuseAs: { "unmute": "<the CLI words an agent might try>" }.');
  throwsLine(() => bindAx(callControlsAx, { actions: controls, refuseAs: { ...refuseAs, share: "" } }), 'CallControls action "share": a person-only action needs the CLI words an agent might try, which refuse. Fix: refuseAs: { "share": "<the CLI words an agent might try>" }.');
  throwsLine(() => bindAx(callControlsAx, { actions: { mute: "call mute" } }), 'CallControls action "leave": an agent action has no twin. Fix: actions: { "leave": "<the CLI command that does it>" }.');
  throwsLine(() => bindAx(callControlsAx, { actions: { ...controls, unmute: "call unmute" }, refuseAs }), 'CallControls action "unmute": it is the person\'s, so it has no twin. Fix: move "call unmute" to refuseAs, where its words refuse.');
  throwsLine(() => bindAx(callControlsAx, { actions: controls, refuseAs: { ...refuseAs, mute: "call mute" } }), 'CallControls action "mute": refuseAs is for a person-only action, and this one is the agent\'s. Fix: bind it under actions, or make it personOnly.');
  throwsLine(() => bindAx(callControlsAx, { actions: { ...controls, join: "call join" } }), 'CallControls action "join": the component declares no such action. Fix: bind one of "mute", "leave", "raise-hand", "lower-hand", "unmute", "camera", "share", "captions".');
  throwsLine(() => bindAx(liveCaptionsAx, { actions: { pin: "call pin" } }), 'LiveCaptions action "pin": the component declares no such action. Fix: bind one of none.');
  throwsLine(() => bindAx(callControlsAx, { reads: { participant: "call participants" }, actions: controls }), 'CallControls read "participant": the component declares no such read. Fix: bind one of none.');
  throwsLine(() => bindAx(mediaTileAx, { reads: { tile: "call tile" } }), 'MediaTile read "tile": the component declares no such read. Fix: bind one of "participant".');
  throwsLine(() => bindAx(mediaTileAx, { actions: { pin: "call pin" } }), 'MediaTile read "participant": it has no twin. Fix: reads: { "participant": "<the CLI read that gives name, muted, camera, speaking, handRaised, connection>" }.');
  throwsLine(() => bindAx(liveCaptionsAx, { reads: { captions: "call captions" } }), 'LiveCaptions read "captions": it streams, but its stream or trigger is not bound. Fix: reads: { "captions": { read: "call captions", push: "<the stream asked for every line>", trigger: "<the words trigger, such as --on mention>" } }.');
  throwsLine(() => bindAx(liveCaptionsAx, { reads: { captions: { read: "call captions", push: "call events", trigger: "" } } }), 'LiveCaptions read "captions": it streams, but its stream or trigger is not bound. Fix: reads: { "captions": { read: "call captions", push: "<the stream asked for every line>", trigger: "<the words trigger, such as --on mention>" } }.');
  throwsLine(() => bindAx(mediaTileAx, { reads: { participant: { read: "call participants", push: "call events", trigger: "--on mention" } }, actions: { pin: "call pin" } }), 'MediaTile read "participant": a stream is bound, but the read does not declare push. Fix: add push: "filtered" to the read.');
});

test("a reserved action is always the person's: declaring it agent: true throws with its reason", () => {
  assert.deepEqual(Object.keys(RESERVED_PERSON_ONLY), ["unmute", "camera", "camera-on", "share", "answer", "decline", "admit", "record"]);
  assert.ok(Object.values(RESERVED_PERSON_ONLY).every((reason) => /^You can't .+; only they can\.$/.test(reason)));
  for (const [id, reason] of Object.entries(RESERVED_PERSON_ONLY)) {
    throwsLine(() => defineComponentAx({ component: "RingCard", reads: [], actions: [{ id, summary: "S.", effect: "others", agent: true }] }), `RingCard action "${id}": it is the person's own, so it is never an agent action. Fix: personOnly: ${JSON.stringify(reason)}.`);
    assert.equal(defineComponentAx({ component: "RingCard", reads: [], actions: [{ id, summary: "S.", effect: "others", personOnly: reason }] }).actions.length, 1);
  }
});

test("expectAxRendered finds each declared action's control by data-ax-action, and names the ones it misses", () => {
  const rendered = (ids: string[]) => ({ querySelector: (selector: string) => (ids.some((id) => selector === `[${AX_ACTION_ATTRIBUTE}=${JSON.stringify(id)}]`) ? {} : null) });
  const all = callControlsAx.actions.map((a) => a.id);
  assert.equal(AX_ACTION_ATTRIBUTE, "data-ax-action");
  assert.doesNotThrow(() => expectAxRendered(callControlsAx, rendered(all)));
  throwsLine(() => expectAxRendered(callControlsAx, rendered(all.filter((id) => id !== "mute" && id !== "share"))), 'CallControls: no rendered control carries data-ax-action="mute", data-ax-action="share". Fix: render each action\'s control with data-ax-action="<its id>".');
  assert.doesNotThrow(() => expectAxRendered(callControlsAx, rendered(["raise-hand"]), { ids: ["raise-hand"] }));
  throwsLine(() => expectAxRendered(callControlsAx, rendered([]), { ids: ["wave"] }), 'CallControls: it declares no action "wave". Fix: check one of "mute", "leave", "raise-hand", "lower-hand", "unmute", "camera", "share", "captions".');
  throwsLine(() => expectAxRendered(liveCaptionsAx, rendered([]), { ids: ["toggle"] }), 'LiveCaptions: it declares no action "toggle". Fix: check one of none.');
});

test("reserved ids are matched by meaning: every alias and case is the person's, and what reduces exposure stays an agent's", () => {
  const reserved = {
    unmute: ["unmute", "Unmute", "UNMUTE", "un-mute", "mic-on", "micOn", "microphone_on", "start-mic", "enable microphone", "turn-on-mic", "mic", "microphone", "toggle-mic", "toggle-mute", "mute-toggle", "mute-off"],
    camera: ["camera", "Camera", "camera-on", "cameraOn", "video", "video-on", "start-video", "enable_camera", "Video", "turn-on-camera", "turnVideoOn", "cam", "cam-on", "webcam-on", "toggle-camera", "resume-video"],
    share: ["share", "Share", "share-screen", "shareScreen", "screen share", "screen_share", "start-share", "present", "start-presenting", "screenshare", "start-screenshare", "screen", "toggle-screenshare"],
    answer: ["answer", "Answer", "accept", "accept-call", "pick-up", "pickUp", "pickup", "answerCall", "accept-incoming-call"],
    decline: ["decline", "Decline", "reject", "reject-call", "declineCall"],
    admit: ["admit", "Admit", "let-in", "letIn", "admit-from-lobby", "admit-lobby"],
    record: ["record", "Record", "recording", "start-recording", "startRecording", "transcribe", "transcription", "start_transcription", "transcript", "transcript-on", "start-transcript", "record-meeting"],
  };
  for (const [canonical, ids] of Object.entries(reserved)) {
    for (const id of ids) {
      assert.equal(isReservedPersonOnly(id), true, id);
      throwsLine(() => defineComponentAx({ component: "RingCard", reads: [], actions: [{ id, summary: "S.", effect: "others", agent: true }] }), `RingCard action "${id}": it is the person's own, so it is never an agent action. Fix: personOnly: ${JSON.stringify(RESERVED_PERSON_ONLY[canonical])}.`);
    }
  }
  const agents = ["mute", "Mute", "mute-all", "camera-off", "cameraOff", "video-off", "stop-share", "stopSharing", "end-share", "stop-recording", "stopTranscription", "disable-camera", "mic-off", "turn-off-camera", "stop-screenshare", "end-call", "leave", "raise-hand", "lower-hand", "pin", "camera-flip", "video-settings", "let", "accept-invite-link", "answer-message", "share-link", "record-note", "decline-suggestion", "captions", "toggle", "leave-call"];
  for (const id of agents) {
    assert.equal(isReservedPersonOnly(id), false, id);
    assert.doesNotThrow(() => defineComponentAx({ component: "CallControls", reads: [], actions: [{ id, summary: "S.", effect: "others", agent: true }] }), id);
  }
});
