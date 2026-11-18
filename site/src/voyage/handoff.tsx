import { Fragment, type JSX } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { CopyButton } from "@/registry/ouro/components/ouro/copy-button/copy-button";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { HANDOFF } from "../copy";
import { GITHUB } from "../paths";
import { latestRelease } from "../latest-release";

/** The release the hand-off's prompt brings in, beside it, linking to that release's notes. */
export const RELEASE_HREF = `${GITHUB}/releases/tag/${latestRelease}`;

/** The prompt's parts, each ending in a "/" but the last, so a web address in it breaks only between its parts. */
const PROMPT_PARTS = HANDOFF.prompt.split(/(?<=\/)(?!\/)/);

/**
 * What a person does once they have seen Ouro UI: hand it to their coding agent, as one line to paste, with Copy beside
 * it. Copy is HX's CopyButton, which says "Copied" on itself, where the reader is looking, rather than in a toast in a
 * corner. The home page's hero shows it with the release and a way to the install commands (`full`); the end of the
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
          {PROMPT_PARTS.map((part, index) => (
            <Fragment key={index}>
              {index > 0 ? <wbr /> : null}
              {part}
            </Fragment>
          ))}
        </p>
        <CopyButton value={HANDOFF.prompt} variant="soft" failedMessage={HANDOFF.blocked} className="site-install-copy" />
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
