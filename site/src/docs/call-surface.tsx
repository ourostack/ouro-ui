import { useRef, useState, type JSX, type ReactNode, type SVGProps } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { MediaTile } from "@/registry/ouro/components/ouro/media-tile/media-tile";
import { Moment } from "@/registry/ouro/components/ouro/moment/moment";
import { SnapPiP } from "@/registry/ouro/components/ouro/snap-pip/snap-pip";
import { Toolbar } from "@/registry/ouro/components/ouro/toolbar/toolbar";

function icon(path: ReactNode) {
  return function Icon(props: SVGProps<SVGSVGElement>) {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>{path}</svg>;
  };
}
const Mic = icon(<path d="M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3" />);
const MicOff = icon(<path d="m3 3 18 18M9 5a3 3 0 0 1 6 1v6M9 9v3a3 3 0 0 0 5 2M5 11a7 7 0 0 0 14 0M12 18v3" />);
const CameraIcon = icon(<path d="M3 7h12v10H3zM15 10l6-3v10l-6-3" />);
const CameraOff = icon(<path d="m3 3 18 18M7 7h8v10H3V7M15 10l6-3v10l-6-3" />);
const Hand = icon(<path d="M8 12V5a1.5 1.5 0 0 1 3 0v6M11 11V3.5a1.5 1.5 0 0 1 3 0V11M14 11V5a1.5 1.5 0 0 1 3 0v8c0 4-2 7-6 7-3 0-5-2-6-4l-2-3a1.5 1.5 0 0 1 3-1L8 14" />);

// Synthetic camera pictures, not live streams. The components receive the same content an app's video would supply.
function Camera({ hue }: { hue: number }): JSX.Element {
  return <div className="size-full" style={{ background:
    `radial-gradient(circle at 50% 40%, hsl(${hue} 28% 80%) 0 12%, transparent 12.5%), ` +
    `radial-gradient(ellipse 32% 38% at 50% 100%, hsl(${hue} 25% 68%) 0 99%, transparent 100%), ` +
    `linear-gradient(145deg, hsl(${hue} 32% 35%), hsl(${hue + 30} 30% 16%))`,
  }} />;
}

/** The three call-surface pages share one working composition, with made-up people and media. */
export function CallSurface(): JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(true);
  const [camera, setCamera] = useState(true);
  const [hand, setHand] = useState(false);
  const [left, setLeft] = useState(false);
  const [status, setStatus] = useState("");
  const changeCall = (leave: boolean) => {
    flushSync(() => {
      setLeft(leave);
      setMuted(true);
      setCamera(true);
      setHand(false);
      setStatus(leave ? "You left the call" : "You joined the call");
    });
    root.current?.querySelector("button")?.focus();
  };
  return (
    <div ref={root} className="grid w-full max-w-2xl gap-3" data-site-call-surface="">
      {left ? (
        <div className="grid min-h-80 place-items-center">
          <Moment kind="success" title="You left the call" description="The conversation is still here when you're ready." action={<Button onClick={() => changeCall(false)}>Rejoin</Button>} />
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-ouro-xl bg-muted p-3 pb-52">
          <div ref={grid} className="grid grid-cols-2 gap-2">
            <MediaTile name="Mara Lind" speaking hysteresis={{ on: 0 }}><Camera hue={200} /></MediaTile>
            <MediaTile name="Jonas Ek" muted><Camera hue={30} /></MediaTile>
            <MediaTile name="Priya Raman" cameraOn={false} handRaised />
            <MediaTile name="Theo Okafor"><Camera hue={275} /></MediaTile>
          </div>
          <SnapPiP label="Your camera" inset={12} keepOut={[grid, controls]}>
            <MediaTile name="You" cameraOn={camera} muted={muted} handRaised={hand} className="h-full aspect-auto">
              <Camera hue={150} />
            </MediaTile>
          </SnapPiP>
          <div ref={controls} className="absolute inset-x-3 bottom-3 flex min-w-0 justify-center">
            <Toolbar label="Call controls" floating className="max-w-full" items={[
              { label: muted ? "Unmute microphone" : "Mute microphone", icon: muted ? MicOff : Mic, hideLabel: true, tone: muted ? "inverse" : "secondary", onClick: () => { setMuted(!muted); setStatus(muted ? "Your microphone is on" : "You are muted"); } },
              { label: camera ? "Turn camera off" : "Turn camera on", icon: camera ? CameraIcon : CameraOff, hideLabel: true, tone: camera ? "secondary" : "inverse", onClick: () => { setCamera(!camera); setStatus(camera ? "Your camera is off" : "Your camera is on"); } },
              { type: "toggle", label: "Raise hand", icon: Hand, hideLabel: true, tone: "primary", pressed: hand, onPressedChange: (next) => { setHand(next); setStatus(next ? "Your hand is raised" : "Your hand is down"); } },
              { type: "separator" },
              { label: "Leave", tone: "destructive", onClick: () => changeCall(true) },
            ]} />
          </div>
        </div>
      )}
      <p className="m-0 text-sm text-muted-foreground">Try the call controls. Drag your picture to a corner, or focus it and use Option-arrow keys.</p>
      <span role="status" className="sr-only">{status}</span>
    </div>
  );
}
