import { createRef, type JSX, type ReactNode } from "react";
import { OuroProvider } from "@/registry/ouro/lib/ouro/ouro-provider";

// One page shows at a time, so one element holds its popups.
const popups = createRef<HTMLDivElement>();

/** Around a page: its menus, selects and popovers open into <Popups /> in its <main>, so landmark navigation reaches them. */
export function PopupsProvider({ children }: { children: ReactNode }): JSX.Element {
  return <OuroProvider portalContainer={popups}>{children}</OuroProvider>;
}

/** Where the page's popups open: last in its <main>. */
export function Popups(): JSX.Element {
  return <div ref={popups} />;
}
