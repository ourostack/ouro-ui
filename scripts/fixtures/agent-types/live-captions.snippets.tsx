// What agents write with live-captions: snippets whose cases are in live-captions.cases.ts.
import { LiveCaptions, type LiveCaptionLine } from "@/registry/ouro/components/ouro/live-captions/live-captions";

const lines: LiveCaptionLine[] = [{ id: "1", speaker: "Mara Lind", text: "Shall we start?", final: true }];

export const liveCaptions01 = <LiveCaptions label="Captions" lines={lines} captions={lines} />;
export const liveCaptions02 = <LiveCaptions lines={lines} />;
export const liveCaptions03 = <LiveCaptions label="Captions" lines={lines} readAloud />;
export const liveCaptions04 = <LiveCaptions label="Captions" lines={[{ id: "1", speaker: "Mara Lind", text: "Shall we start?", final: true, isFinal: true }]} />;
export const liveCaptions05 = <LiveCaptions label="Captions" lines={lines} size="xl" />;
export const liveCaptionsValid = <LiveCaptions label="Captions" hideLabel lines={lines} size="lg" maxLines={3} announce className="max-w-3xl" />;
