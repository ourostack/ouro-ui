import { useEffect, useRef, useState, type JSX, type MouseEvent } from "react";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { docsItems } from "../docs/items";
import { tries } from "../docs/tries";
import { href } from "../routes";

/** The components Surprise me opens: the ones whose page says what to try with the demo, so a visitor lands on a trick. */
export const SURPRISES: readonly { name: string; title: string }[] = docsItems.filter((item) => item.name in tries);

/** How the link leaves the page; a test swaps it to stay. */
export const surpriseNav = { go: (url: string): void => location.assign(url) };

const STEPS = 6;
const STEP_MS = 80;

/** How long, in milliseconds, the names roll from a click before the page leaves: a test holds the clock and advances it this far instead of waiting on the real timer. */
export const ROLL_MS = STEPS * STEP_MS + STEP_MS * 2;

/** A component page to open, picked at random from `SURPRISES`. */
function pick(): { name: string; title: string } {
  return SURPRISES[Math.floor(Math.random() * SURPRISES.length)]!;
}

/**
 * "Surprise me", on the docs index: it opens a random component whose demo has a trick to try. Pressed, the names
 * roll past beside it for half a second, like a slot machine, and stop on the one it opens. With reduced motion,
 * or a click that opens a new tab, it goes straight there. Without script it opens the first one.
 */
export function SurpriseMe(): JSX.Element {
  const [rolling, setRolling] = useState<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // True while the names roll, until it leaves.
  const busy = useRef(false);
  useEffect(() => {
    // Leaving mid-roll stops it, so a page the browser keeps and later restores never leaves on its own; it comes back ready to roll again.
    const stop = () => {
      clearTimeout(timer.current);
      busy.current = false;
      setRolling(undefined);
    };
    addEventListener("pagehide", stop);
    addEventListener("pageshow", stop);
    return () => {
      clearTimeout(timer.current);
      removeEventListener("pagehide", stop);
      removeEventListener("pageshow", stop);
    };
  }, []);

  const aim = (event: MouseEvent<HTMLAnchorElement>) => {
    const choice = pick();
    event.currentTarget.href = href(`/docs/${choice.name}/`);
    return choice;
  };

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const newTab = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
    if (!newTab && busy.current) {
      event.preventDefault();
      return;
    }
    const choice = aim(event);
    if (newTab || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    event.preventDefault();
    busy.current = true;
    const url = event.currentTarget.href;
    const roll = (step: number) => {
      if (step === STEPS) {
        setRolling(choice.title);
        timer.current = setTimeout(() => {
          // A stopped load leaves the link working.
          busy.current = false;
          surpriseNav.go(url);
        }, STEP_MS * 2);
        return;
      }
      setRolling(pick().title);
      timer.current = setTimeout(() => roll(step + 1), STEP_MS);
    };
    roll(0);
  };

  return (
    // One line, so a long name rolling past never splits it.
    <span className="whitespace-nowrap">
      <Link href={href(`/docs/${SURPRISES[0]!.name}/`)} onClick={onClick} onAuxClick={aim}>
        Surprise me
      </Link>
      {rolling !== undefined && (
        <span aria-hidden="true" data-site-surprise className="font-medium text-primary">
          {" "}→ {rolling}
        </span>
      )}
    </span>
  );
}
