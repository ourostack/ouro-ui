import { bindAx, defineComponentAx } from "../component.ts";

const theirs = "agents never turn on a person's microphone, camera or screen";

export const mediaTileAx = defineComponentAx({
  component: "MediaTile",
  reads: [{ name: "participant", summary: "Who is in the tile, and what they are doing.", fields: ["name", "muted", "camera", "speaking", "handRaised", "connection"], consent: "none" }],
  actions: [{ id: "pin", summary: "Keep this tile in the person's main view.", effect: "private", agent: true }],
});

export const toolbarAx = defineComponentAx({
  component: "Toolbar",
  reads: [],
  actions: [
    { id: "mute", summary: "Mute the person's microphone.", effect: "others", agent: true },
    { id: "leave", summary: "Leave the call.", effect: "others", agent: true },
    { id: "raise-hand", summary: "Raise the person's hand.", effect: "others", agent: true },
    { id: "unmute", summary: "Turn the person's microphone on.", effect: "others", personOnly: theirs },
    { id: "camera", summary: "Turn the person's camera on.", effect: "others", personOnly: theirs },
    { id: "share", summary: "Share the person's screen.", effect: "others", personOnly: theirs },
  ],
});

export const liveCaptionsAx = defineComponentAx({
  component: "LiveCaptions",
  reads: [{ name: "captions", summary: "What people say, once the person asks you to follow the meeting.", fields: ["speaker", "text", "at"], consent: "listening", push: "filtered" }],
  actions: [],
});

export const ui = [
  ...bindAx(mediaTileAx, { reads: { participant: "call participants <meeting>" }, actions: { pin: "call pin <participant>" } }),
  ...bindAx(toolbarAx, {
    actions: { mute: "call mute <meeting>", leave: "call leave <meeting>", "raise-hand": "call raise-hand <meeting>" },
    refuseAs: { unmute: "call unmute", camera: "call camera", share: "call share" },
  }),
  ...bindAx(liveCaptionsAx, {
    reads: { captions: { read: "call captions <meeting>", push: "call events <meeting> --stream live-transcript", trigger: "--on mention" } },
  }),
];
