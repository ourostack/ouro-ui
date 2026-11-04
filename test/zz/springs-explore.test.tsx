import { createRoot } from "react-dom/client";
import { it } from "vitest";
import { commands, server, userEvent } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const variants = ["default", "chat", "post", "reply"] as const;
function Chat({ count }: { count: number }) {
  return (
    <MessageList label="Conversation" style={{ height: 700 }}>
      {Array.from({ length: count }, (_, index) => (
        <Message key={index} id={`x-${index}`} role={index % 2 ? "assistant" : "user"} name={index % 2 ? "Ouro" : "Ana Lind"} variant={variants[index % 4]}
          presence="available" presenceLabel="Available" time="9:41 AM"
          quote={index % 5 === 1 ? { author: "Ana Lind", excerpt: "How long should the dough rest?" } : undefined}
          actions={[{ key: "reply", label: "Reply", icon: "↩", onClick: () => {} }, { key: "react", label: "React", icon: "☺", onClick: () => {} }]}
          menu={[{ label: "Copy", onClick: () => {} }]}>
          {`Message ${index}: ${"rest the dough ".repeat(1 + (index % 4))}`}
        </Message>
      ))}
    </MessageList>
  );
}

/** Elements in the scroller, after the first spring layer in paint order, that have a RenderLayer of their own: the ones WebKit may composite by assumed overlap. */
function exposed(scroller: HTMLElement) {
  const all = [...scroller.querySelectorAll<HTMLElement>("*")];
  const first = all.findIndex((element) => getComputedStyle(element).willChange !== "auto");
  if (first === -1) return { layered: 0, after: 0 };
  const base = all[first]!;
  let after = 0;
  for (const element of all.slice(first + 1)) {
    if (base.contains(element)) continue;
    if (element.getClientRects().length === 0) continue;
    const style = getComputedStyle(element);
    if (style.position !== "static" || style.transform !== "none" || style.willChange !== "auto" || Number(style.opacity) < 1 || style.overflow !== "visible" || style.filter !== "none") after++;
  }
  return { layered: all.filter((element) => getComputedStyle(element).willChange !== "auto").length, after };
}

const out: string[] = [];
for (const iso of ["", "isolate"]) for (const pointer of ["parked"]) for (const mode of ["current", "plain"]) {
  it(`mode ${mode} pointer ${pointer} ${iso}`, { timeout: 60_000 }, async () => {
    (globalThis as { __springMode?: string }).__springMode = mode;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<Chat count={200} />));
    const scroller = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
    if (iso) scroller.style.isolation = "isolate";
    const park = document.createElement("div");
    park.style.cssText = "position:fixed;left:0;top:0;width:4px;height:4px;z-index:99";
    document.body.append(park);
    if (pointer === "parked") await userEvent.hover(park);
    else await userEvent.hover(scroller, { position: { x: 200, y: 300 } });
    await new Promise((r) => setTimeout(r, 300));
    const chromium = server.browser === "chromium";
    const rest = chromium ? (await commands.compositedLayers()).length : -1;
    let peakSettling = 0;
    let peakExposed = { layered: 0, after: 0 };
    let mid = -1;
    for (let notch = 0; notch < 12; notch++) {
      scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, clientY: scroller.getBoundingClientRect().top + 30, bubbles: true }));
      scroller.scrollTop -= 100;
      scroller.dispatchEvent(new Event("scroll"));
      await new Promise((r) => requestAnimationFrame(r));
      peakSettling = Math.max(peakSettling, scroller.querySelectorAll("[data-ouro-settling]").length);
      const e = exposed(scroller);
      if (e.after > peakExposed.after) peakExposed = e;
      if (notch >= 2 && chromium) { const l = await commands.compositedLayers(); if (l.length <= mid) continue; mid = l.length; const tally: Record<string, number> = {}; for (const x of l) tally[String(x.element).slice(0, 140) + ' ' + x.width + 'x' + x.height] = (tally[String(x.element).slice(0, 140) + ' ' + x.width + 'x' + x.height] ?? 0) + 1; out.push(`${mode} ${pointer} mid layers: ${JSON.stringify(tally)}`); }
    }
    await new Promise((r) => setTimeout(r, 2500));
    const after = chromium ? (await commands.compositedLayers()).length : -1;
    out.push(`${server.browser}\t${mode}\t${pointer}\t${iso}\trest=${rest}\tmid=${mid}\tafter=${after}\tmovingRows=${peakSettling}\twillChangeEls=${peakExposed.layered}\tlayeredAfterFirst=${peakExposed.after}`);
    await commands.writeFile(`.tmp/explore-${server.browser}.txt`, out.join("\n"));
    await act(async () => root.unmount());
    host.remove();
    park.remove();
  });
}
