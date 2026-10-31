import { claim } from "@/registry/ouro/lib/ouro/claims";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { watchXray } from "../xray-store";
import { firstFind } from "./listen";
import "./eggs.css";

/** The leagues in the book's title, where the log stops. */
export const LEAGUES = 20_000;

/** The leagues traveled at a share of the story scrolled (0 to 1), by tens; the last stretch of the page counts as the end. */
export function leaguesAt(share: number): number {
  if (share >= 0.99) return LEAGUES;
  return Math.max(0, Math.round((share * LEAGUES) / 10) * 10);
}

const number = new Intl.NumberFormat("en-US");

/**
 * The ship's log on the Nautilus's page: a small count at the screen's bottom corner of the leagues
 * traveled, which grows as the reader scrolls the story (and never runs back), and stops at twenty
 * thousand at the end of the page with a wink, and a toast once a visit that says why: the book's
 * title is a distance, not a depth. The count is decoration, hidden from screen readers, which
 * hear the toast. It steps aside while X-ray is on.
 */
export function startLeagues(): () => void {
  const log = document.createElement("div");
  log.className = "egg-leagues";
  log.dataset.egg = "leagues";
  log.setAttribute("aria-hidden", "true");
  const count = log.appendChild(document.createElement("span"));
  count.className = "egg-leagues-count";
  const words = log.appendChild(document.createElement("span"));
  words.className = "egg-leagues-words";
  words.textContent = "leagues traveled";
  document.body.append(log);
  const unwatchXray = watchXray((on) => log.toggleAttribute("data-xray", on));

  let traveled = 0;
  let frame = 0;
  const update = () => {
    frame = 0;
    const room = document.documentElement.scrollHeight - innerHeight;
    traveled = Math.max(traveled, leaguesAt(room > 0 ? scrollY / room : 1));
    count.textContent = number.format(traveled);
    const done = traveled === LEAGUES;
    if (done === log.hasAttribute("data-done")) return;
    log.toggleAttribute("data-done", done);
    words.textContent = done ? "leagues: a distance, not a depth!" : "leagues traveled";
    if (done && firstFind("leagues")) {
      toast(claim("Twenty thousand leagues!", { source: { spec: "https://en.wikipedia.org/wiki/Twenty_Thousand_Leagues_Under_the_Seas" }, verify: { urlOk: "https://en.wikipedia.org/wiki/Twenty_Thousand_Leagues_Under_the_Seas" } }), {
        description: claim(
          "That's the distance in the book's title, Twenty Thousand Leagues Under the Seas: how far the Nautilus sails, about 80,000 km, nearly twice around the Earth. No sea is that deep.",
          { source: { spec: "https://en.wikipedia.org/wiki/Twenty_Thousand_Leagues_Under_the_Seas" }, verify: { urlOk: "https://en.wikipedia.org/wiki/Twenty_Thousand_Leagues_Under_the_Seas" } },
        ),
      });
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);
  update();
  requestAnimationFrame(() => log.setAttribute("data-open", ""));
  return () => {
    cancelAnimationFrame(frame);
    unwatchXray();
    removeEventListener("scroll", schedule);
    removeEventListener("resize", schedule);
    log.remove();
  };
}
