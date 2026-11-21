"use client";

import { PreviewBar } from "@/components/ouro/preview-bar/preview-bar";

// PreviewBar needs handlers, so the app's section is a Client Component that the server still renders.
// expect: aria-pressed="false"
export default function PreviewBarSection() {
  return (
    <div id="ouro-preview-bar-section">
      <PreviewBar label="Trying the Ocean theme" onKeep={() => {}} onDiscard={() => {}} onCompareChange={() => {}} />
    </div>
  );
}
