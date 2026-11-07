// What agents write with media-tile: snippets whose cases are in media-tile.cases.ts.
import { MediaTile } from "@/registry/ouro/components/ouro/media-tile/media-tile";

export const mediaTile01 = <MediaTile name="Mara Lind" level={0.6} />;
export const mediaTile02 = <MediaTile speaking />;
export const mediaTile03 = <MediaTile name="Mara Lind" speaking={0.6} />;
export const mediaTile04 = <MediaTile name="Mara Lind" isMuted />;
export const mediaTile05 = <MediaTile name="Mara Lind" label="Mara Lind" />;
export const mediaTile06 = <MediaTile name="Theo Okafor" source="screen" objectFit="contain" />;
export const mediaTile07 = <MediaTile name="Mara Lind" src="/mara.jpg" />;
export const mediaTile08 = <MediaTile name="Jonas Ek" connection="bad" />;
export const mediaTileValid = <MediaTile name="Mara Lind" speaking muted handRaised connection="poor" avatar={{ src: "/mara.jpg" }} pinned onPinnedChange={() => {}} hysteresis={{ on: 300, off: 600 }} onVisibilityChange={() => {}}><video autoPlay playsInline muted /></MediaTile>;
