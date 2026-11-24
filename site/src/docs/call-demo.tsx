import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX, type ReactNode, type SVGProps } from "react";
import { AgentPresence, type ListeningAgent } from "@/registry/ouro/components/ouro/agent-presence/agent-presence";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { LevelMeter } from "@/registry/ouro/components/ouro/level-meter/level-meter";
import { LiveCaptions, type LiveCaptionLine } from "@/registry/ouro/components/ouro/live-captions/live-captions";
import { MediaTile } from "@/registry/ouro/components/ouro/media-tile/media-tile";
import { Moment } from "@/registry/ouro/components/ouro/moment/moment";
import { Popover } from "@/registry/ouro/components/ouro/popover/popover";
import { ReactionBar } from "@/registry/ouro/components/ouro/reaction-bar/reaction-bar";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { SnapPiP, type SnapPiPCorner } from "@/registry/ouro/components/ouro/snap-pip/snap-pip";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { Timer } from "@/registry/ouro/components/ouro/timer/timer";
import { Toolbar, type ToolbarEntry } from "@/registry/ouro/components/ouro/toolbar/toolbar";
import { CodeBlock } from "../components/code";
import { DocsShell } from "../components/docs-shell";
import { TrayArt } from "./tray-art";

// A whole call window from Ouro's call components with made-up people and no real media, as an app would assemble it:
// a tile grid that reflows from one person to six, the speaking ring, muted and camera-off tiles, captions, the control
// bar, the person's own picture in a SnapPiP, a timer, a lobby with a microphone meter, a joining state and an empty
// "waiting for others" state. It ships in no registry item; docs/call-demo/ shows it. The default export is the whole
// page (the docs shell and lead included), so site/src/pages/docs.tsx can load it as one lazy chunk.

function icon(path: ReactNode) {
  return function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
        {path}
      </svg>
    );
  };
}
const MicIcon = icon(<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />);
const MicOffIcon = icon(<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16" />);
const VideoIcon = icon(<path d="M3 7h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3zM16 10l5-3v10l-5-3" />);
const VideoOffIcon = icon(<path d="M3 7h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3zM16 10l5-3v10l-5-3M3 3l18 18" />);
const ShareIcon = icon(<path d="M4 5h16v11H4zM8 20h8M12 16v4M9.5 10.5 12 8l2.5 2.5M12 8v5" />);
const SmileIcon = icon(<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />);
const HandIcon = icon(<path d="M8 12V5a1.5 1.5 0 0 1 3 0v6M11 11V3.5a1.5 1.5 0 0 1 3 0V11M14 11V5a1.5 1.5 0 0 1 3 0v8c0 4-2 7-6 7-3 0-4.5-1.5-6-4l-1.5-3a1.5 1.5 0 0 1 2.5-1.5L8 14" />);
const CaptionsIcon = icon(<path d="M3 6h18v12H3zM8 11h3M8 14h2M14 11h2M13 14h3" />);

interface Person {
  name: string;
  hue: number;
  muted?: boolean;
  cameraOff?: boolean;
  poor?: boolean;
  hand?: boolean;
}

const ME = "Priya Okafor";
const everyone: Person[] = [
  { name: "Mara Quill", hue: 200 },
  { name: "Theo Brandt", hue: 30, muted: true },
  { name: "Ana Lind", hue: 150, cameraOff: true },
  { name: "Grace Hopper", hue: 320, poor: true },
  { name: "Jonas Ek", hue: 260, hand: true },
  { name: "Maximilian Alexander von Hohenstaufen-Wellington", hue: 60, muted: true },
];

const script = [
  { speaker: "Mara Quill", text: "Let's start with the venue, which confirmed the long table." },
  { speaker: "Grace Hopper", text: "I can bring the extension cord and the speakers on Friday." },
  { speaker: "Jonas Ek", text: "Could we also check the projector before doors open?" },
  { speaker: "Mara Quill", text: "Yes, I'll add it to the run of show and tape the cable down." },
];

const quick = [
  { key: "like", label: "Like", emoji: "👍" },
  { key: "heart", label: "Love", emoji: "❤️" },
  { key: "clap", label: "Applause", emoji: "👏" },
  { key: "laugh", label: "Laugh", emoji: "😂" },
  { key: "wow", label: "Surprised", emoji: "😮" },
];

const helper: ListeningAgent = { id: "notes", name: "note-taker agent", doing: "writing down decisions and who owns them" };

type Stage = "lobby" | "joining" | "call" | "waiting" | "left";

function Camera({ hue }: { hue: number }): JSX.Element {
  return (
    <div
      className="size-full"
      style={{
        background:
          `radial-gradient(circle at 50% 42%, hsl(${hue} 30% 78%) 0 11%, transparent 11.5%), ` +
          `radial-gradient(ellipse 30% 32% at 50% 92%, hsl(${hue} 28% 70%) 0 99%, transparent 100%), ` +
          `linear-gradient(160deg, hsl(${hue} 45% 32%), hsl(${hue + 40} 40% 18%))`,
      }}
    />
  );
}

/** A made-up microphone: a level that rises and falls like speech. */
function useFakeLevel(active: boolean): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    const timer = window.setInterval(() => {
      const t = (Date.now() - start) / 1000;
      setLevel(0.004 + 0.1 * Math.abs(Math.sin(t * 2.3) * Math.sin(t * 0.7)));
    }, 80);
    return () => window.clearInterval(timer);
  }, [active]);
  return level;
}

function subscribeNarrow(notify: () => void): () => void {
  const query = window.matchMedia("(max-width: 639px)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

const inviteLink = "https://example.com/join/design-review";

/** A call window in one box: a lobby, a joining moment, the call itself, an empty room and a goodbye. */
function CallDemo(): JSX.Element {
  const [stage, setStage] = useState<Stage>("call");
  const [others, setOthers] = useState(4);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [handUp, setHandUp] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [corner, setCorner] = useState<SnapPiPCorner>("bottom-right");
  // On a phone with a full grid no corner is free of a face, so the picture starts tucked away; the person can show it.
  const narrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia("(max-width: 639px)").matches, () => false);
  const [chosenHidden, setSelfHidden] = useState<boolean | null>(null);
  const selfHidden = chosenHidden ?? narrow;
  const [agents, setAgents] = useState<ListeningAgent[]>([helper]);
  // Each message is its own node, so the same words said twice are announced twice.
  const [said, setSaid] = useState({ text: "", n: 0 });
  const status = said.text;
  const setStatus = useCallback((text: string) => setSaid((now) => ({ text, n: now.n + 1 })), []);
  const [lines, setLines] = useState<LiveCaptionLine[]>([]);
  const [speaker, setSpeaker] = useState(0);
  const [pinned, setPinned] = useState("");
  // The made-up speaker, captions and level hold still while a pointer or focus is in the window, so what a person aims at stays put.
  const [still, setStill] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const moved = useRef(false);
  const step = useRef(0);

  const visible = everyone.slice(0, others);
  const inCall = stage === "call";
  const level = useFakeLevel(stage === "lobby" && !still);

  const go = useCallback((next: Stage, byApp: boolean) => {
    moved.current = byApp;
    setStage(next);
    setStatus(next === "left" ? "You left the call" : next === "call" && byApp ? "You joined the call" : "");
    if (next === "left") {
      setHandUp(false);
      setPinned("");
      setSharing(false);
    }
  }, [setStatus]);
  useEffect(() => {
    if (stage !== "joining") return;
    const timer = window.setTimeout(() => go("call", true), 1400);
    return () => window.clearTimeout(timer);
  }, [stage, go]);

  // Hand focus to a control in the new view when the app, not the person's own switch, changes it: the control that was pressed is gone, and a bare group would say nothing useful.
  useEffect(() => {
    if (moved.current) {
      const scope = stage === "call" ? bottomRef.current : stageRef.current;
      (scope?.querySelector<HTMLElement>("button:not([disabled])") ?? stageRef.current)?.focus();
    }
    moved.current = false;
  }, [stage]);

  // The ring follows a made-up speaker detection that moves between the people who are not muted.
  useEffect(() => {
    if (!inCall || still) return;
    const timer = window.setInterval(() => setSpeaker((now) => now + 1), 2600);
    return () => window.clearInterval(timer);
  }, [inCall, still]);
  const talkers = visible.map((person, index) => (person.muted ? -1 : index)).filter((index) => index >= 0);
  const speaking = talkers.length ? talkers[speaker % talkers.length] : -1;

  // Captions come in as an interim line that firms up, then the next speaker.
  useEffect(() => {
    if (!inCall || !captionsOn || still) return;
    const timer = window.setInterval(() => {
      const turn = script[Math.floor(step.current / 2) % script.length]!;
      const final = step.current % 2 === 1;
      const id = `c${Math.floor(step.current / 2)}`;
      const words = turn.text.split(" ");
      const line: LiveCaptionLine = { id, speaker: turn.speaker, text: final ? turn.text : words.slice(0, Math.ceil(words.length / 2)).join(" "), final };
      setLines((now) => [...now.filter((existing) => existing.id !== id), line].slice(-4));
      step.current += 1;
    }, 1700);
    return () => window.clearInterval(timer);
  }, [inCall, captionsOn, still]);

  const toggleMute = useCallback(() => {
    setMuted((now) => {
      setStatus(now ? "You are unmuted" : "You are muted");
      return !now;
    });
  }, [setStatus]);
  // The app binds the shortcut the toolbar shows: ⇧⌘M, or Ctrl+Shift+M off Apple platforms.
  useEffect(() => {
    if (stage !== "call" && stage !== "lobby") return;
    const onKey = (event: KeyboardEvent) => {
      if (!((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "m")) return;
      event.preventDefault();
      toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, toggleMute]);

  const changeOthers = (value: string) => {
    const next = Number(value);
    if (next > others) setStatus(`${everyone[next - 1]!.name} joined`);
    else if (next < others) setStatus(`${everyone[others - 1]!.name} left`);
    setOthers(next);
  };

  const copyInvite = () => {
    const copied = navigator.clipboard?.writeText(inviteLink);
    if (!copied) return setStatus("Couldn't copy the link");
    copied.then(
      () => setStatus("Invite link copied"),
      () => setStatus("Couldn't copy the link"),
    );
  };

  const items = useMemo<ToolbarEntry[]>(
    () => [
      { type: "toggle", label: "Mute", icon: muted ? MicOffIcon : MicIcon, hideLabel: true, shortcut: ["shift", "mod", "m"], pressed: muted, onPressedChange: toggleMute },
      {
        type: "toggle",
        label: "Stop video",
        icon: cameraOff ? VideoOffIcon : VideoIcon,
        hideLabel: true,
        pressed: cameraOff,
        onPressedChange: (next) => {
          setCameraOff(next);
          setStatus(next ? "Your camera is off" : "Your camera is on");
        },
      },
      ...(stage === "lobby"
        ? []
        : ([
            { type: "separator" },
            {
              type: "toggle",
              label: "Share screen",
              icon: ShareIcon,
              hideLabel: true,
              pressed: sharing,
              onPressedChange: (next: boolean) => {
                setSharing(next);
                // A shared screen fills a phone's stage, so no corner is clear of the bar or a face.
                if (next && narrow) setSelfHidden(true);
                setStatus(next ? "You are sharing your screen" : "You stopped sharing");
              },
            },
            {
              type: "toggle",
              label: "Captions",
              icon: CaptionsIcon,
              hideLabel: true,
              pressed: captionsOn,
              onPressedChange: (next: boolean) => {
                setCaptionsOn(next);
                setStatus(next ? "Captions on" : "Captions off");
              },
            },
            {
              type: "toggle",
              label: "Raise hand",
              icon: HandIcon,
              hideLabel: true,
              pressed: handUp,
              onPressedChange: (next: boolean) => {
                setHandUp(next);
                setStatus(next ? "Your hand is raised" : "Your hand is down");
              },
            },
            { label: "React", icon: SmileIcon, hideLabel: true, onClick: () => setReactionsOpen(true) },
          ] satisfies ToolbarEntry[])),
    ],
    [muted, cameraOff, sharing, captionsOn, handUp, stage, toggleMute, setStatus, narrow],
  );

  const selfPicture = cameraOff ? (
    <div className="grid size-full place-items-center bg-muted">
      <Avatar name={ME} size="lg" />
    </div>
  ) : (
    <Camera hue={340} />
  );

  const bar = (
    <div className="flex min-w-0 flex-wrap items-center justify-center gap-2">
      <Toolbar label="Call controls" items={items} />
      {stage === "call" ? (
        <Button tone="destructive" onClick={() => go("left", true)}>
          Leave
        </Button>
      ) : null}
    </div>
  );

  let body: JSX.Element;
  if (stage === "joining") {
    body = (
      <div className="grid h-full place-items-center">
        <Moment kind="loading" announce title="Joining Design review" description="Checking your camera and microphone." />
      </div>
    );
  } else if (stage === "waiting") {
    body = (
      <div className="grid h-full place-items-center">
        <Moment kind="empty" art={<TrayArt />} title="Waiting for others to join" description="You're the first one here. Share the link and they can join." action={<Button variant="outline" tone="secondary" onClick={copyInvite}>Copy invite link</Button>} />
      </div>
    );
  } else if (stage === "left") {
    body = (
      <div className="grid h-full place-items-center">
        <Moment kind="success" title="You left the call" description="The others are still talking." action={<Button onClick={() => go("lobby", true)}>Rejoin</Button>} />
      </div>
    );
  } else if (stage === "lobby") {
    body = (
      <div className="mx-auto grid h-full w-full max-w-xl content-center gap-4 p-4">
        <MediaTile name={ME} cameraOn={!cameraOff} muted={muted} avatar={{ idForColor: ME }}>
          <Camera hue={340} />
        </MediaTile>
        <LevelMeter label="Microphone level" value={level} muted={muted} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          {bar}
          <Button onClick={() => go("joining", true)}>Join now</Button>
        </div>
      </div>
    );
  } else {
    const tiles = (sharing ? 1 : 0) + visible.length;
    body = (
      <div className="relative flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <div
            ref={gridRef}
            className={
              "grid gap-2 " +
              (tiles <= 1 ? "grid-cols-1" : tiles === 2 ? "grid-cols-1 md:grid-cols-2" : tiles <= 4 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3")
            }
          >
            {sharing ? (
              <MediaTile name={ME} source="screen" presenting ring={false} className="col-span-full">
                <Camera hue={90} />
              </MediaTile>
            ) : null}
            {visible.map((person, index) => (
              <MediaTile
                key={person.name}
                name={person.name}
                speaking={index === speaking}
                muted={person.muted}
                cameraOn={!person.cameraOff}
                connection={person.poor ? "poor" : "good"}
                handRaised={person.hand}
                pinned={pinned === person.name}
                onPinnedChange={(next) => setPinned(next ? person.name : "")}
                avatar={{ idForColor: person.name }}
              >
                <Camera hue={person.hue} />
              </MediaTile>
            ))}
          </div>
        </div>
        <div ref={bottomRef} className="grid gap-2 p-2">
          {captionsOn ? (
            <LiveCaptions label="Captions" hideLabel lines={lines} maxLines={2} />
          ) : null}
          <div className="flex min-w-0 justify-center">
            {bar}
          </div>
        </div>
        <SnapPiP label="Your camera" corner={corner} onCornerChange={setCorner} collapsed={selfHidden} onCollapsedChange={setSelfHidden} keepOut={[gridRef, bottomRef]}>
          {selfPicture}
        </SnapPiP>
        <Popover title="React" open={reactionsOpen} onOpenChange={setReactionsOpen} anchor={bottomRef}>
          <ReactionBar
            reactions={[]}
            quick={quick}
            onReact={(key) => {
              setReactionsOpen(false);
              setStatus(`You reacted: ${quick.find((option) => option.key === key)?.label ?? key}`);
            }}
          />
        </Popover>
      </div>
    );
  }

  return (
    <div className="grid w-full grid-cols-1 gap-3" data-site-call-demo="">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="min-w-0 overflow-x-auto">
          <SegmentedControl
            label="State"
            fullWidth
            value={stage}
            onValueChange={(value) => go(value as Stage, false)}
            items={[
              { value: "lobby", label: "Lobby" },
              { value: "joining", label: "Join" },
              { value: "call", label: "Call" },
              { value: "waiting", label: "Alone" },
              { value: "left", label: "Left" },
            ]}
          />
        </div>
        <div className="min-w-0 overflow-x-auto">
          <SegmentedControl
            label="Others in the call"
            value={String(others)}
            onValueChange={changeOthers}
            items={[1, 2, 3, 4, 5, 6].map((count) => ({ value: String(count), label: String(count) }))}
          />
        </div>
      </div>
      <div className="flex min-h-10 flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-1.5">
        <span className="text-sm font-semibold">Design review</span>
        <p role="status" className="m-0 min-w-0 flex-1 truncate text-sm text-muted-foreground">
          <span key={said.n}>{status}</span>
        </p>
        <AgentPresence label="Agents listening" agents={agents} onStop={(id) => setAgents((now) => now.filter((agent) => agent.id !== id))} onStopAll={() => setAgents([])} compact />
      </div>
      <div
        ref={stageRef}
        tabIndex={-1}
        onPointerEnter={() => setStill(true)}
        onPointerLeave={() => setStill(false)}
        onFocusCapture={() => setStill(true)}
        onBlurCapture={() => setStill(false)}
        style={inCall && others > 4 ? { height: "46rem" } : undefined}
        aria-label="Call"
        role="group"
        className="h-160 overflow-hidden rounded-lg border border-border outline-none">
        {body}
      </div>
      <div className="min-w-0 max-w-sm">
        <Text size="sm" tone="muted" className="mb-2">
          The timer is the app's to set: here it counts down a made-up half-hour limit, apart from the window.
        </Text>
        <Timer label="Meeting ends in" duration={1800} />
      </div>
    </div>
  );
}

const shortCall = `import { MediaTile } from "@/components/ouro/media-tile/media-tile";
import { LiveCaptions } from "@/components/ouro/live-captions/live-captions";
import { Toolbar } from "@/components/ouro/toolbar/toolbar";
import { SnapPiP } from "@/components/ouro/snap-pip/snap-pip";

export function CallWindow({ people, lines, controls }) {
  const gridRef = useRef(null);
  const controlsRef = useRef(null);
  return (
    <>
      <div ref={gridRef}>
        {people.map((person) => (
          <MediaTile key={person.id} name={person.name} speaking={person.speaking} muted={person.muted} cameraOn={person.cameraOn}>
            <video ref={person.videoRef} />
          </MediaTile>
        ))}
      </div>
      <div ref={controlsRef}>
        <LiveCaptions label="Captions" hideLabel lines={lines} />
        <Toolbar label="Call controls" items={controls} />
      </div>
      <SnapPiP label="Your camera" keepOut={[gridRef, controlsRef]}>
        <video />
      </SnapPiP>
    </>
  );
}`;

/** The docs/call-demo/ page: the demo behind its own lazy chunk, lead text and shell included. */
export default function CallDemoPage(): JSX.Element {
  return (
    <DocsShell current="/docs/call-demo/" opener={{ scene: "ouroboros-skills", eyebrow: "Guides", title: "A call window" }}>
      <Text size="lg" tone="muted" className="mb-10 max-w-2xl text-pretty" data-ouro-measure="">
        The call components together, with made-up people and placeholder pictures: a tile grid that grows as people join, speaking, muted and camera-off
        tiles, captions, the control bar, your own picture in a corner, a timer, and the lobby, joining and waiting states. The State and Others in the call switchers above the window, the moving speaker, captions
        and microphone level, the Design review header, the made-up half-hour timer and the invite link are the demo's own script; an app supplies the real ones.
        The tiles, captions, control bar, level meter, picture-in-picture, reactions and timer are Ouro components. Try the keyboard, a narrow window and dark mode.
      </Text>
      <CallDemo />
      <Heading level={2} className="mt-12 mb-4">
        A short assembly
      </Heading>
      <CodeBlock label="Call window" code={shortCall} copy />
    </DocsShell>
  );
}
