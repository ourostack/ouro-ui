import { createRoot } from "react-dom/client";
import { it } from "vitest";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { holdFrames } from "@/registry/ouro/lib/ouro/testing/frames";

async function bench(count: number) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MessageList label="Bench" style={{ height: 700 }}>
        {Array.from({ length: count }, (_, i) => (
          <Message key={i} role={i % 3 === 1 ? "user" : "assistant"} name={i % 3 === 1 ? "Ada" : "Ouro"}>
            {`Message ${i}: ${"word ".repeat(8 + (i % 20))}`}
          </Message>
        ))}
      </MessageList>,
    ),
  );
  const scroller = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
  scroller.scrollTop = scroller.scrollHeight / 2;
  await new Promise((r) => setTimeout(r, 100));
  const frames = holdFrames();
  const real = window.requestAnimationFrame;
  const times: number[] = [];
  const realNow = Performance.prototype.now.bind(performance);
  window.requestAnimationFrame = (cb) => real((t) => { const s = realNow(); cb(t); times.push(realNow() - s); });
  const box = scroller.getBoundingClientRect();
  let transformed = 0;
  for (let f = 0; f < 120; f++) {
    const delta = f < 60 ? Math.round((3000 / 60) * Math.pow(0.998, (f * 1000) / 60)) : 0;
    if (delta) {
      scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: delta, clientY: box.top + box.height * 0.7 }));
      scroller.scrollTop += delta;
      scroller.dispatchEvent(new Event("scroll"));
    }
    const start = realNow();
    frames.step(1000 / 60);
    times.push(realNow() - start);
    transformed = Math.max(transformed, scroller.querySelectorAll("[data-ouro-settling]").length);
  }
  window.requestAnimationFrame = real;
  frames.release();
  const sorted = times.filter((t) => t > 0).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
  (globalThis as any).__r = (globalThis as any).__r ?? []; (globalThis as any).__r.push(`BENCH ${count} messages: frames ${sorted.length}, median ${median.toFixed(3)}ms, p95 ${p95.toFixed(3)}ms, max ${sorted.at(-1)!.toFixed(3)}ms, most moving at once ${transformed}`);
  root.unmount();
  host.remove();
}

it("bench", async () => {
  await bench(50);
  await bench(1000);
  await bench(5000); throw new Error((globalThis as any).__r.join(" | "));
}, 120000);
