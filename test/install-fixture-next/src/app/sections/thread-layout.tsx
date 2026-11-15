import { ThreadLayout } from "@/components/ouro/thread-layout/thread-layout";
import { ThreadRail } from "@/components/ouro/thread-rail/thread-rail";

async function closeThread() {
  "use server";
}

// expect: data-ouro="thread-layout"
// expect: Ouro trail crew
// expect: Meet at eight.
export default function ThreadLayoutSection() {
  return (
    <div style={{ height: 320 }}>
      <ThreadLayout
        conversation={<p>Ouro trail crew: pack the lanterns.</p>}
        thread={
          <ThreadRail label="Thread" title="Ouro replies" meta="1 reply" onClose={closeThread}>
            <p>Meet at eight.</p>
          </ThreadRail>
        }
      />
    </div>
  );
}
