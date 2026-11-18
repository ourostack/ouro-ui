import type { JSX } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { HANDOFF } from "../copy";
import { GITHUB } from "../paths";
import { latestRelease } from "../latest-release";
import { keepClearOfToasts } from "./clear-of-toasts";

/** The release the hand-off's prompt brings in, beside it, linking to that release's notes. */
export const RELEASE_HREF = `${GITHUB}/releases/tag/${latestRelease}`;

function CopyIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <rect x="7" y="7" width="9.5" height="9.5" rx="2" />
      <path d="M13 4.5A1.5 1.5 0 0 0 11.5 3H5a2 2 0 0 0-2 2v6.5A1.5 1.5 0 0 0 4.5 13" />
    </svg>
  );
}

/**
 * What a person does once they have seen Ouro UI: hand it to their coding agent, as one line to paste, with Copy beside
 * it. The home page's hero shows it with the release and a way to the install commands (`full`); the end of the
 * Nautilus's voyage shows the line and Copy alone, so everything there is one of the chapter's own controls. Its
 * styles are in the page's stylesheet (voyage.css), so a chapter that shows it adds no CSS.
 */
export function HandOff({ id = "site-handoff-label", full = true }: { id?: string; full?: boolean }): JSX.Element {
  return (
    <div className="site-install-block site-handoff" role="group" aria-labelledby={id} data-site-handoff="">
      <div className="site-handoff-head">
        <p id={id} className="site-handoff-label">
          {HANDOFF.label}
        </p>
        {full ? (
          <Badge href={RELEASE_HREF} tone="primary" variant="soft" data-site-release="">
            {`${latestRelease} · latest release`}
          </Badge>
        ) : null}
      </div>
      <div className="site-install">
        <p className="site-handoff-prompt" data-site-handoff-prompt="">
          {HANDOFF.prompt}
        </p>
        <Button
          variant="soft"
          tone="secondary"
          size="sm"
          className="site-install-copy"
          onClick={(event) => {
            const block = event.currentTarget.closest(".site-install-block");
            void navigator.clipboard.writeText(HANDOFF.prompt).then(
              () => toast(HANDOFF.copied, { tone: "success" }),
              () => toast("The browser blocked the clipboard", { tone: "destructive", description: "Select the line and copy it yourself." }),
            ).then(() => keepClearOfToasts(block));
          }}
        >
          <CopyIcon />
          Copy
        </Button>
      </div>
      <p className="site-install-caption" data-site-handoff-caption="">
        {HANDOFF.caption}
        {full ? (
          <>
            {" "}
            <span className="site-install-more">
              <Link href={HANDOFF.commands.href} tone="secondary" inline>
                {HANDOFF.commands.text}
              </Link>
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}
