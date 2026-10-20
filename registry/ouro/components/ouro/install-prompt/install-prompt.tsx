"use client";

import type { ComponentProps, JSX, ReactNode } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { useInstallPrompt } from "@/registry/ouro/lib/ouro/install-prompt";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Card } from "@/registry/ouro/components/ouro/card/card";

/** Props for {@link InstallPrompt}. */
export interface InstallPromptProps {
  /** The offer's title. @default "Install the app" */
  title?: string | undefined;
  /** What installing gives the person. @default "Add it to your home screen or dock and open it like any other app." */
  description?: ReactNode;
  /** A picture across the top, such as the app on a phone. */
  media?: ReactNode;
  /** The label of the button that opens the browser's install dialog. @default "Install" */
  installLabel?: string | undefined;
  /** The label of the button that puts the offer away. @default "Not now" */
  dismissLabel?: string | undefined;
  /** Days before offering again after Not now. @default 14 */
  remindAfterDays?: number | undefined;
  /** The `localStorage` key that keeps when the person said Not now. @default "ouro-install-dismissed" */
  storageKey?: string | undefined;
  /** Called with how the person answered the browser's install dialog. */
  onInstall?: ((outcome: "accepted" | "dismissed") => void) | undefined;
  /** The title's heading level. @default 2 */
  headingLevel?: ComponentProps<typeof Card>["headingLevel"];
  /** Layout only: margins, width (`mt-6`, `max-w-md`). Appearance classes warn in development. */
  className?: string | undefined;

  /** Not a prop. The offer shows itself when the browser can install the app; there is nothing to open. */
  open?: { 'InstallPrompt shows itself when the app can be installed': never };
  /** Not a prop. Ouro UI says `onInstall`: `<InstallPrompt onInstall={(outcome) => …} />`. */
  onAccept?: { 'Use onInstall={(outcome) => ...}': never };
}

/**
 * A quiet offer to install the web app, shown only where the browser can install it (Chromium
 * on Android and desktops), never while it already runs installed, and not again for two weeks
 * after Not now. Install opens the browser's own install dialog. It renders nothing otherwise,
 * so it can sit in a layout unconditionally. The browser's install event is caught as soon as
 * the module loads, so an offer is never missed because the page mounted late.
 *
 * Use `useInstallPrompt` instead to offer installing from a control of your own, such as a menu item.
 *
 * @group Feedback
 * @see https://ourostack.github.io/ouro-ui/docs/install-prompt
 *
 * @example
 * <InstallPrompt className="mt-6" />
 */
export function InstallPrompt(props: InstallPromptProps): JSX.Element | null {
  const {
    title = "Install the app",
    description = "Add it to your home screen or dock and open it like any other app.",
    media,
    installLabel = "Install",
    dismissLabel = "Not now",
    remindAfterDays,
    storageKey,
    onInstall,
    headingLevel = 2,
    className,
    open,
    onAccept,
  } = props;
  useAppearanceClassNameCheck(
    "InstallPrompt",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; InstallPrompt sets its own look from the theme`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "InstallPrompt",
    process.env.NODE_ENV !== "production"
      ? () => [
          open !== undefined && ["open is not a prop; the offer shows itself when the app can be installed", "<InstallPrompt />"],
          onAccept !== undefined && ["onAccept is not a prop", "<InstallPrompt onInstall={(outcome) => {}} />"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const { available, install, dismiss } = useInstallPrompt({ remindAfterDays, storageKey });
  if (!available) return null;
  const accept = async () => {
    const outcome = await install();
    if (outcome !== "unavailable") onInstall?.(outcome);
  };
  return (
    <div data-ouro="install-prompt" className={className}>
      <Card
        title={title}
        description={description}
        media={media}
        headingLevel={headingLevel}
        size="sm"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button data-ouro-control="install-prompt" data-ouro-part="dismiss" variant="plain" tone="secondary" onClick={dismiss}>
              {dismissLabel}
            </Button>
            <Button data-ouro-control="install-prompt" data-ouro-part="install" onClick={accept}>
              {installLabel}
            </Button>
          </div>
        }
      />
    </div>
  );
}
