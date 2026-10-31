import { claim } from "@/registry/ouro/lib/ouro/claims";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import nautilus from "../../nautilus/art/nautilus.svg?raw";
import "./eggs.css";

/** How long Captain Nemo's visit lasts, unless dismissed: the ship's crossing, or a still moment with reduced motion. */
export const NEMO_MS = 6500;
export const NEMO_STILL_MS = 4000;

/**
 * The bubbles: where each rises from, its size, when it starts and how far it drifts, and the
 * height it rests at with reduced motion, the same on every visit.
 */
export const BUBBLES = Array.from({ length: 28 }, (_, index) => ({
  x: (index * 37) % 100,
  y: 5 + ((index * 53) % 80),
  size: 6 + ((index * 13) % 22),
  delay: ((index * 7) % 30) / 10,
  drift: ((index * 29) % 41) - 20,
}));

let playing: (() => void) | null = null;

/**
 * Captain Nemo waves hello: bubbles fill the screen and the Nautilus sails across it, its lantern
 * flashing a hello, then a toast says who he is. The drawing takes no pointer and no focus, so the
 * page stays usable; a press, a tap or Escape ends it early. With reduced motion nothing moves:
 * the bubbles and the ship fade in still, and out again.
 */
export function playNemo(): () => void {
  playing?.();
  const layer = document.createElement("div");
  layer.className = "egg-nemo";
  layer.dataset.egg = "nemo";
  layer.setAttribute("aria-hidden", "true");
  for (const bubble of BUBBLES) {
    const span = layer.appendChild(document.createElement("span"));
    span.className = "egg-bubble";
    span.style.cssText = `--x:${bubble.x}%;--y:${bubble.y}%;--size:${bubble.size}px;--delay:${bubble.delay}s;--drift:${bubble.drift}px`;
  }
  const ship = layer.appendChild(document.createElement("div"));
  ship.className = "egg-ship";
  // Its own gradient id, so the drawing never shares one with the porthole's Nautilus.
  ship.innerHTML = nautilus.replace(/<title>[\s\S]*?<\/title>/, "").replaceAll("nautilus-sheen", "egg-nautilus-sheen");
  document.body.append(layer);
  requestAnimationFrame(() => layer.setAttribute("data-open", ""));

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const timer = setTimeout(() => end(), still ? NEMO_STILL_MS : NEMO_MS);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") end();
  };
  const end = () => {
    clearTimeout(timer);
    removeEventListener("keydown", onKey);
    removeEventListener("pointerdown", end, true);
    if (playing === end) playing = null;
    layer.removeAttribute("data-open");
    layer.setAttribute("data-closing", "");
    setTimeout(() => layer.remove(), 300);
  };
  addEventListener("keydown", onKey);
  addEventListener("pointerdown", end, true);
  playing = end;
  toast("Captain Nemo waves hello!", {
    description: `${claim("Nemo commands the Nautilus, the submarine in Jules Verne's novel Twenty Thousand Leagues Under the Seas.", { source: { spec: "https://en.wikipedia.org/wiki/Twenty_Thousand_Leagues_Under_the_Seas" }, verify: { urlOk: "https://en.wikipedia.org/wiki/Twenty_Thousand_Leagues_Under_the_Seas" } })} You called him by typing his name.`,
  });
  return end;
}
