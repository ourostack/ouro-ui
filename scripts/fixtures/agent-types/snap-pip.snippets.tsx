// What agents write with snap-pip: snippets whose cases are in snap-pip.cases.ts.
import { SnapPiP } from "@/registry/ouro/components/ouro/snap-pip/snap-pip";

const toolbar = { current: null };
const save = () => {};

export const snapPip01 = <SnapPiP label="Your camera" position={{ x: 24, y: 24 }} />;
export const snapPip02 = <SnapPiP label="Your camera" offset={16} />;
export const snapPip03 = <SnapPiP label="Your camera" avoid={[toolbar]} />;
export const snapPip04 = <SnapPiP label="Your camera" corner="top" onCornerChange={save} />;
export const snapPip05 = <SnapPiP corner="top-left" onCornerChange={save} />;
export const snapPip06 = <SnapPiP label="Your camera" corner="top-left" />;
export const snapPipValid = <SnapPiP label="Your camera" corner="bottom-right" onCornerChange={save} size="small" onSizeChange={save} inset={16} keepOut={[toolbar, { x: 0, y: 400, width: 800, height: 80 }]} aspectRatio={16 / 10} hint="Option-arrow keys to move it" cornerLabels={{ "top-left": "Top left", "top-right": "Top right", "bottom-left": "Bottom left", "bottom-right": "Bottom right" }} className="z-10" id="self-view" />;
