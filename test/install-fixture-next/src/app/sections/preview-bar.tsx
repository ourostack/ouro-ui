import { PreviewBar } from "@/components/ouro/preview-bar/preview-bar";

// Server Actions as the handlers: a Server Component can pass those, and PreviewBar renders on the server with its buttons.
async function keep() {
  "use server";
}

async function discard() {
  "use server";
}

async function compare(comparing: boolean) {
  "use server";
  return comparing;
}

// expect: aria-pressed="false"
export default function PreviewBarSection() {
  return (
    <div id="ouro-preview-bar-section">
      <PreviewBar label="Trying the Ocean theme" onKeep={keep} onDiscard={discard} onCompareChange={compare} />
    </div>
  );
}
