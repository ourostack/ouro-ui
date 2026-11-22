import type { KeyboardEvent } from "react";

/**
 * One Tab stop for a row of pressable dots, with the arrow keys moving between them: the pressed dot is the stop
 * (the first when the pressed name is not in the row), and Home and End jump to the ends. Arrows move focus only; a press chooses. `ThemePicker` uses it.
 */
export function rovingRow(names: readonly string[], pressed: string): { tabIndex: (name: string) => 0 | -1; onKeyDown: (event: KeyboardEvent<HTMLElement>) => void } {
  const stop = names.includes(pressed) ? pressed : names[0];
  return {
    tabIndex: (name) => (name === stop ? 0 : -1),
    onKeyDown(event) {
      const dots = [...event.currentTarget.querySelectorAll<HTMLElement>("button")];
      const at = dots.indexOf(event.target as HTMLElement);
      if (at === -1 || event.altKey || event.ctrlKey || event.metaKey) return;
      const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
      const step = { ArrowRight: rtl ? -1 : 1, ArrowDown: 1, ArrowLeft: rtl ? 1 : -1, ArrowUp: -1 }[event.key];
      const next = event.key === "Home" ? 0 : event.key === "End" ? dots.length - 1 : step === undefined ? undefined : (at + step + dots.length) % dots.length;
      if (next === undefined) return;
      event.preventDefault();
      dots[next]!.focus();
    },
  };
}
