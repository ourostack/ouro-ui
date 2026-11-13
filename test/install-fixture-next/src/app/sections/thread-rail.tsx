import { ThreadRail } from "@/components/ouro/thread-rail/thread-rail";

async function closeThread() {
  "use server";
}

// expect: data-ouro="thread-rail"
// expect: Ouro replies
// expect: Ouro trail crew
export default function ThreadRailSection() {
  return (
    <div style={{ height: 320, display: "flex" }}>
      <ThreadRail label="Thread" title="Ouro replies" detail="Ouro trail crew" meta="1 reply" onClose={closeThread}>
        <p>Meet at eight.</p>
      </ThreadRail>
    </div>
  );
}
