import { MediaTile } from "@/registry/ouro/components/ouro/media-tile/media-tile";

export default function MediaTileDemo() {
  return <div className="grid w-full grid-cols-2 gap-2">
    <MediaTile name="Mara Lind" cameraOn={false} speaking />
    <MediaTile name="Jonas Ek" cameraOn={false} muted />
  </div>;
}
