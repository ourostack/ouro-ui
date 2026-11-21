import { PreviewBar } from "@/components/ouro/preview-bar/preview-bar";

// PreviewBar renders on the server with its buttons; its handlers are the app's.
// expect: aria-pressed="false"
export default function PreviewBarSection() {
  return (
    <div id="ouro-preview-bar-section">
      <PreviewBar label="Trying the Ocean theme" onKeep={() => {}} onDiscard={() => {}} onCompareChange={() => {}} />
    </div>
  );
}
