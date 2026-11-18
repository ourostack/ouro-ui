import type { JSX } from "react";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { GITHUB } from "../paths";

/** What a search asked for, trimmed to a name that reads in a sentence. */
function wanted(query: string): string {
  const name = query.trim().replace(/\s+/g, " ");
  return name.length > 32 ? `${name.slice(0, 31)}…` : name;
}

/** A new issue on the repository, filled in: a request for what the search found nothing for. */
export function askForUrl(query: string): string {
  const name = query.trim().replace(/\s+/g, " ");
  const params = new URLSearchParams({
    title: `Component request: ${name}`,
    body: `I searched the Ouro UI docs for "${name}" and found nothing.\n\nWhat I want it to do:\n\n`,
  });
  return `${GITHUB}/issues/new?${params}`;
}

/** After a search finds nothing: a way to ask for it, so the dead end is a door. */
export function AskFor({ query }: { query: string }): JSX.Element | null {
  if (wanted(query) === "") return null;
  return (
    <>
      {" "}
      Want one?{" "}
      <Link href={askForUrl(query)} external>
        Ask for “{wanted(query)}”
      </Link>
    </>
  );
}
