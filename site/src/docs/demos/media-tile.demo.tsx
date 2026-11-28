import { useState, type JSX } from "react";
import { MediaTile } from "@/registry/ouro/components/ouro/media-tile/media-tile";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";

// The live demo at the top of docs/media-tile/: the component as an app would use it, with its props, nothing else.
// A CSS gradient stands in for each camera, and the people are made up.

function Camera({ hue }: { hue: number }): JSX.Element {
  return (
    <div
      style={{
        background:
          `radial-gradient(circle at 50% 42%, hsl(${hue} 30% 78%) 0 11%, transparent 11.5%), ` +
          `radial-gradient(ellipse 30% 32% at 50% 92%, hsl(${hue} 28% 70%) 0 99%, transparent 100%), ` +
          `linear-gradient(160deg, hsl(${hue} 45% 32%), hsl(${hue + 40} 40% 18%))`,
      }}
    />
  );
}

export default function MediaTileDemo(): JSX.Element {
  const [speaker, setSpeaker] = useState("Mara Lind");
  const [cameraOn, setCameraOn] = useState(true);
  const [muted, setMuted] = useState(true);
  const [pinned, setPinned] = useState("");
  const [seen, setSeen] = useState("");
  const pin = (name: string) => (next: boolean) => setPinned(next ? name : "");
  return (
    <div className="grid w-full max-w-2xl gap-4">
      <div className="grid grid-cols-2 gap-2">
        <MediaTile
          name="Mara Lind"
          speaking={speaker === "Mara Lind"}
          pinned={pinned === "Mara Lind"}
          onPinnedChange={pin("Mara Lind")}
          onVisibilityChange={(visible, width, height) => setSeen(`${visible ? "Seen" : "Not seen"} at ${width} × ${height}`)}
        >
          <Camera hue={200} />
        </MediaTile>
        <MediaTile name="Jonas Ek" speaking={speaker === "Jonas Ek"} muted={muted} cameraOn={cameraOn} pinned={pinned === "Jonas Ek"} onPinnedChange={pin("Jonas Ek")}>
          <Camera hue={30} />
        </MediaTile>
        <MediaTile name="Priya Raman" handRaised cameraOn={false} pinned={pinned === "Priya Raman"} onPinnedChange={pin("Priya Raman")} />
        <MediaTile name="Theo Okafor" connection="poor" paused="video paused on a poor connection" pinned={pinned === "Theo Okafor"} onPinnedChange={pin("Theo Okafor")}>
          <Camera hue={280} />
        </MediaTile>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <Switch label="Jonas is speaking" checked={speaker === "Jonas Ek"} onCheckedChange={(on) => setSpeaker(on ? "Jonas Ek" : "Mara Lind")} />
        <Switch label="Jonas's camera" checked={cameraOn} onCheckedChange={setCameraOn} />
        <Switch label="Jonas is muted" checked={muted} onCheckedChange={setMuted} />
      </div>
      <p className="m-0 text-sm text-muted-foreground">
        Mara's tile: {seen || "measuring"}
      </p>
    </div>
  );
}
