import { SnapPiP } from "@/registry/ouro/components/ouro/snap-pip/snap-pip";
import { MediaTile } from "@/registry/ouro/components/ouro/media-tile/media-tile";

export default function SnapPiPDemo() {
  return <div className="relative h-48 w-full">
    <SnapPiP label="Your camera">
      <MediaTile name="You" cameraOn={false} className="h-full aspect-auto" />
    </SnapPiP>
  </div>;
}
