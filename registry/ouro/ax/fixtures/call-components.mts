import { bindAx, defineComponentAx } from "../component.ts";

const theirs = "You can't turn on the person's microphone, camera or screen; only they can.";

export const mediaTileAx = defineComponentAx({
  component: "MediaTile",
  reads: [{ id: "participant", summary: "Who is in the tile, and what they are doing.", fields: ["name", "muted", "camera", "speaking", "handRaised", "connection"], consent: "none" }],
  actions: [{ id: "pin", summary: "Keep this tile in the person's main view.", effect: "private", agent: true }],
});

export const callControlsAx = defineComponentAx({
  component: "CallControls",
  reads: [],
  actions: [
    { id: "mute", summary: "Mute the person's microphone.", effect: "others", agent: true },
    { id: "leave", summary: "Leave the call.", effect: "others", agent: true },
    { id: "raise-hand", summary: "Raise the person's hand.", effect: "others", agent: true },
    { id: "lower-hand", summary: "Lower the person's hand.", effect: "others", agent: true },
    { id: "unmute", summary: "Turn the person's microphone on.", effect: "others", personOnly: theirs },
    { id: "camera", summary: "Turn the person's camera on.", effect: "others", personOnly: theirs },
    { id: "share", summary: "Share the person's screen.", effect: "others", personOnly: theirs },
    { id: "captions", summary: "Turn captions on.", effect: "private", personOnly: "You can't turn the person's captions on or off; only they can." },
  ],
});

export const liveCaptionsAx = defineComponentAx({
  component: "LiveCaptions",
  reads: [{ id: "captions", summary: "What people say, once the person asks you to follow the meeting.", fields: ["speaker", "text", "at"], consent: "listening", push: "filtered" }],
  actions: [],
});

export const agentPresenceAx = defineComponentAx({
  component: "AgentPresence",
  reads: [{ id: "listening", summary: "Which of the person's agents are listening, and what each listens for.", fields: ["agent", "doing"], consent: "none" }],
  actions: [
    { id: "stop", summary: "Stop your own listening: your row only, never another agent's.", effect: "private", agent: true, scope: "self" },
    { id: "stop-all", summary: "Stop every agent listening for the person.", effect: "private", personOnly: "You can't stop every agent; only the person can. Stop your own listening with stop." },
  ],
});

export const ui = [
  ...bindAx(mediaTileAx, { reads: { participant: "call participants <meeting>" }, actions: { pin: "call pin <participant>" } }),
  ...bindAx(callControlsAx, {
    actions: { mute: "call mute <meeting>", leave: "call leave <meeting>", "raise-hand": "call raise-hand <meeting>", "lower-hand": "call lower-hand <meeting>" },
    refuseAs: { unmute: "call unmute", camera: "call camera", share: "call share", captions: "call captions on" },
  }),
  ...bindAx(liveCaptionsAx, {
    reads: { captions: { read: "call captions <meeting>", push: "call events <meeting> --stream live-transcript", trigger: "--on mention" } },
  }),
  ...bindAx(agentPresenceAx, {
    reads: { listening: "call agents <meeting>" },
    actions: { stop: "call unfollow <meeting> <listener> --agent <me>" },
    refuseAs: { "stop-all": "call unfollow-all" },
  }),
];
