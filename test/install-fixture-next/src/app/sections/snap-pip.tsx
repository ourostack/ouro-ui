import { SnapPiP } from "@/components/ouro/snap-pip/snap-pip";

// expect: data-ouro="snap-pip"
// expect: aria-label="Ouro self view"
// expect: data-ax-action="move"
// SnapPiP is in its corner in the server HTML, placed by CSS until it measures its container.
// expect: style="right:16px;bottom:16px;width:clamp(160px, calc(100% / 6), 320px)
export default function SnapPiPSection() {
  return (
    <div style={{ position: "relative", height: 240 }}>
      <SnapPiP label="Ouro self view">
        <div style={{ width: "100%", height: "100%" }} />
      </SnapPiP>
    </div>
  );
}
