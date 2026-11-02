import { LiveCaptions } from "@/components/ouro/live-captions/live-captions";

// expect: Ouro live captions
// LiveCaptions is a region named by its label, with the speaker's first name and the words in the server HTML.
// expect: role="region"[^>]*aria-labelledby=
// expect: data-ouro-live-captions-speaker="">Ouro</span>
// expect: Shall we start\?
// Before anyone speaks it shows its placeholder line; when unavailable is set, that message instead.
// expect: data-ouro-live-captions-placeholder="">Waiting for someone to speak…</p>
// expect: data-ouro-live-captions-unavailable="">Ouro captions are not offered here</div>
export default function LiveCaptionsSection() {
  return (
    <>
      <LiveCaptions label="Ouro live captions" lines={[{ id: "1", speaker: "Ouro Speaker", text: "Shall we start?", final: true }]} />
      <LiveCaptions label="Ouro waiting captions" lines={[]} />
      <LiveCaptions label="Ouro unavailable captions" lines={[]} unavailable="Ouro captions are not offered here" />
    </>
  );
}
