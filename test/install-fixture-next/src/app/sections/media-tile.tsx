import { MediaTile } from "@/components/ouro/media-tile/media-tile";

// The tile's sentence, its speaking ring and its name plate are in the server HTML.
// expect: role="group"[^>]*aria-label="Ouro person, speaking, muted, camera on"
// expect: data-ouro-part="ring"[^>]*data-highlighted=""
// expect: >Ouro person<
export default function MediaTileSection() {
  return (
    <MediaTile name="Ouro person" speaking muted>
      <div />
    </MediaTile>
  );
}
