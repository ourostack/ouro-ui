import { type JSX } from "react";
import { AgentHandoff } from "@/registry/ouro/components/ouro/agent-handoff/agent-handoff";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { HANDOFF } from "../copy";
import { GITHUB } from "../paths";
import { latestRelease } from "../latest-release";

/** The release the hand-off's prompt brings in, beside it, linking to that release's notes. */
export const RELEASE_HREF = `${GITHUB}/releases/tag/${latestRelease}`;

/**
 * What a person does once they have seen Ouro UI: hand it to their coding agent, as one line to paste, with Copy beside
 * it. It is HX's AgentHandoff, so its fixes reach every app with the next Ouro update. The home page's hero shows it
 * with the release and a way to the install commands (`full`); the end of the Nautilus's voyage shows the line and
 * Copy alone, so everything there is one of the chapter's own controls.
 */
export function HandOff({ full = true }: { full?: boolean }): JSX.Element {
  return (
    <AgentHandoff
      data-site-handoff=""
      label={HANDOFF.label}
      prompt={HANDOFF.prompt}
      failedMessage={HANDOFF.blocked}
      aside={
        full ? (
          <Badge href={RELEASE_HREF} tone="primary" variant="soft" data-site-release="">
            {`${latestRelease} · latest release`}
          </Badge>
        ) : undefined
      }
      caption={
        full ? (
          <>
            {HANDOFF.caption}{" "}
            <span className="site-install-more whitespace-nowrap">
              <Link href={HANDOFF.commands.href} tone="secondary" inline>
                {HANDOFF.commands.text}
              </Link>
            </span>
          </>
        ) : (
          HANDOFF.caption
        )
      }
    />
  );
}
