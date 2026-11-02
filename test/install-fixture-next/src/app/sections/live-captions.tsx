import { LiveCaptions } from "@/components/ouro/live-captions/live-captions";

// expect: Ouro live captions
// LiveCaptions is a region named by its label, with the speaker's first name and the words in the server HTML.
// expect: role="region"[^>]*aria-labelledby=
// expect: data-ouro-live-captions-speaker="">Ouro</span>
// expect: Shall we start\?
export default function LiveCaptionsSection() {
  return <LiveCaptions label="Ouro live captions" lines={[{ id: "1", speaker: "Ouro Speaker", text: "Shall we start?", final: true }]} />;
}
