import type { JSX } from "react";

// The live demo at the top of each docs page, one file per component:
// site/src/docs/demos/<item name>.demo.tsx, whose default export is the demo.

const modules = import.meta.glob<{ default: () => JSX.Element }>("./demos/*.demo.tsx", { eager: true });

/** Each docs page's demo, by registry item name. */
export const demos: Record<string, () => JSX.Element> = Object.fromEntries(
  Object.entries(modules).map(([path, module]) => [path.replace(/^\.\/demos\/(.+)\.demo\.tsx$/, "$1"), module.default]),
);
