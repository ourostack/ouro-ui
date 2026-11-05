import { useRef, useState, type JSX } from "react";
import { SnapPiP, type SnapPiPCorner } from "@/registry/ouro/components/ouro/snap-pip/snap-pip";

// The live demo at the top of docs/snap-pip/: the component as an app would use it, with its props, nothing else.
// The "video" is a made-up gradient, and the band along the bottom stands in for a call's controls.

export default function SnapPiPDemo(): JSX.Element {
  const band = useRef<HTMLDivElement>(null);
  const [corner, setCorner] = useState<SnapPiPCorner>("bottom-right");
  return (
    <div className="grid w-full max-w-2xl gap-3">
      <div
        className="relative h-80 overflow-hidden rounded-xl text-white"
        style={{ background: "radial-gradient(circle at 40% 35%, oklch(0.72 0.09 60), oklch(0.42 0.07 30) 55%, oklch(0.24 0.04 260))" }}
      >
        <p className="absolute start-4 top-4 m-0 rounded-full bg-black/60 px-2.5 py-1 text-sm">Mara Lind</p>
        <div ref={band} className="absolute inset-x-0 bottom-0 flex h-16 items-center justify-center bg-black/55 text-sm">
          Call controls
        </div>
        <SnapPiP label="Your camera" corner={corner} onCornerChange={setCorner} keepOut={[band]}>
          <div aria-hidden="true" className="size-full" style={{ background: "linear-gradient(135deg, oklch(0.78 0.08 200), oklch(0.5 0.1 250))" }} />
        </SnapPiP>
      </div>
      <p className="m-0 text-sm text-muted-foreground">Throw it to a corner, or focus it and press Option and an arrow key. It rests in: {corner}.</p>
    </div>
  );
}
