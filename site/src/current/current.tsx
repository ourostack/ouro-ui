import { useEffect, useState, type JSX } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { Container } from "../voyage/layout";
import { INSTALL_URL, isNewer, LIVE_URL, SNAPSHOT, stamp, type Current, type CurrentPin, type CurrentRepo } from "./data";
import "./current.css";

/*
 * /current/: the front door of Ouro Current, our own Dependabot for Ouro UI (scripts/current/). It leads with what it
 * does and one Install button, says plainly what it does and never does, then lists who it keeps current from
 * current.json, which every run of .github/workflows/ouro-current.yml publishes.
 */

const README = "https://github.com/ourostack/ouro-ui/tree/main/scripts/current#readme";

const STATE: Record<string, { label: string; tone: "success" | "warning" | "destructive" | "secondary" }> = {
  current: { label: "current", tone: "success" },
  pr: { label: "update open", tone: "warning" },
  failed: { label: "could not update", tone: "destructive" },
};

/** One row per file, release and version: a project that takes two Ouro packages at one version is one row. */
const pinRows = (pins: CurrentPin[]): CurrentPin[] => [...new Map(pins.map((pin) => [`${pin.file}-${pin.follows}-${pin.current}`, pin])).values()];

function Repo({ repo }: { repo: CurrentRepo }): JSX.Element {
  const state = STATE[repo.state] ?? { label: repo.state, tone: "secondary" as const };
  return (
    <li className="current-repo">
      <div className="current-repo-head">
        <h3 className="current-h3">
          <Link href={`https://github.com/${repo.repo}`}>{repo.repo}</Link>
        </h3>
        <Badge tone={state.tone} variant="soft">
          {state.label}
        </Badge>
      </div>
      <ul className="current-pins">
        {pinRows(repo.pins).map((pin) => (
          <li key={`${pin.file}-${pin.follows}-${pin.current}`}>
            <code>{pin.file}</code> {pin.behind ? `${pin.current} to ${pin.latest}` : `${pin.current}, up to date`}
          </li>
        ))}
      </ul>
      {repo.pr ? (
        <p className="current-detail">
          <Link href={repo.pr.url}>Pull request #{repo.pr.number}</Link>
        </p>
      ) : null}
    </li>
  );
}

/** The page, given the list it paints first: used by the route (pages/voyage.tsx) and its test. */
export function CurrentPage({ initial = SNAPSHOT, live = true }: { initial?: Current; live?: boolean }): JSX.Element {
  const [list, setList] = useState(initial);
  const [waiting, setWaiting] = useState<Current | null>(null);
  // As on /adoption/, a newer list waits behind a button, so nothing moves under the reader's eyes while the page loads.
  useEffect(() => {
    if (!live) return;
    const controller = new AbortController();
    fetch(LIVE_URL, { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((next: unknown) => {
        if (isNewer(next, initial)) setWaiting(next);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [initial, live]);

  const releases = Object.entries(list.releases);
  const open = list.repos.filter((repo) => repo.state === "pr").length;
  const shown = list.repos.length;

  return (
    <div id="current" className="current">
      <section aria-labelledby="current-title" className="site-hero current-hero">
        <Container>
          <p className="site-eyebrow">Ouro Current</p>
          <h1 id="current-title" className="site-h1">
            Ouro UI releases, delivered as one pull request that merges on{"\u00a0"}green.
          </h1>
          <div className="site-lede current-lede">
            <p>
              Install the Ouro Current GitHub App on a repository. Each Ouro UI release, for the web, Apple, Windows or Android, and each Ouro UI core release, arrives there as one pull request,{" "}
              <strong>“Update to Ouro UI vX”</strong>, with auto-merge on. Your own checks decide whether it lands.
            </p>
          </div>
          <div className="current-actions">
            <Button href={INSTALL_URL}>Install Ouro Current</Button>
            <Link href={README}>How it works</Link>
          </div>
          <p className="current-detail current-setup">Nothing to set up: it finds the pin files by their names. To stop it, uninstall the app from the repository’s settings.</p>
        </Container>
      </section>

      <section aria-labelledby="current-releases" className="current-section">
        <Container>
          <h2 id="current-releases" className="current-h2">
            Latest releases
          </h2>
          <dl className="current-releases">
            {releases.map(([key, release]) => (
              <div key={key} className="current-release">
                <dt>{release.name}</dt>
                <dd>
                  <Link href={release.url}>{release.tag}</Link>
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <section aria-labelledby="current-how" className="current-section">
        <Container>
          <h2 id="current-how" className="current-h2">
            What it does
          </h2>
          <ol className="current-steps">
            <li>
              <h3 className="current-h3">It finds your pins</h3>
              <p>
                {claim("It reads the Ouro HX install record, files vendored from Ouro UI core or from a commit, SwiftPM, XcodeGen, an Xcode project, NuGet package references, Gradle build scripts and version catalogs, and a workflow's OURO_UI_TAG.", { source: { test: "scripts/current/current.test.mjs::pins are found by file name in every format Ouro UI is taken in" }, verify: { testExists: "scripts/current/current.test.mjs::pins are found by file name in every format Ouro UI is taken in" } })}
              </p>
            </li>
            <li>
              <h3 className="current-h3">It moves them to the latest release</h3>
              <p>
                {claim("An Ouro HX file takes the new release's source, written to your aliases the way the shadcn CLI writes it, and files the release added come with it.", { source: { test: "scripts/current/current.test.mjs::Ouro HX takes the new tag's source as the CLI would write it, adds files its items gained, and leaves an edited file alone" }, verify: { testExists: "scripts/current/current.test.mjs::Ouro HX takes the new tag's source as the CLI would write it, adds files its items gained, and leaves an edited file alone" } })}
              </p>
            </li>
            <li>
              <h3 className="current-h3">It moves native pins in place</h3>
              <p>
                {claim("On Windows and Android only the Ouro package's version changes, where your file writes it, and a lock file that holds the old package's hashes is named in the pull request with the command that writes it again.", { source: { test: "scripts/current/current.test.mjs::a NuGet or Gradle update opens one pull request, and names a lock file holding the old package's hashes instead of writing it" }, verify: { testExists: "scripts/current/current.test.mjs::a NuGet or Gradle update opens one pull request, and names a lock file holding the old package's hashes instead of writing it" } })}
              </p>
            </li>
            <li>
              <h3 className="current-h3">It keeps one pull request</h3>
              <p>
                {claim("One branch, ouro-current/update, and one pull request per repository, updated in place when a newer release comes.", { source: { test: "scripts/current/current.test.mjs::one pull request per repository: opened once, left alone when nothing changed, and updated in place" }, verify: { testExists: "scripts/current/current.test.mjs::one pull request per repository: opened once, left alone when nothing changed, and updated in place" } })}{" "}
                {claim("Auto-merge is on, squash where the repository allows it, else a merge commit.", { source: { test: "scripts/current/current.test.mjs::auto-merge falls back to a merge method the repository allows" }, verify: { testExists: "scripts/current/current.test.mjs::auto-merge falls back to a merge method the repository allows" } })}
              </p>
            </li>
          </ol>
          <h3 className="current-h3 current-never-title">What it leaves alone</h3>
          <ul className="current-never">
            <li>{claim("It never writes to your default branch and never merges anything itself.", { source: { test: "scripts/current/current.test.mjs::one pull request per repository: opened once, left alone when nothing changed, and updated in place" }, verify: { testExists: "scripts/current/current.test.mjs::one pull request per repository: opened once, left alone when nothing changed, and updated in place" } })}</li>
            <li>{claim("It never overwrites a file you edited; it names that file in the pull request instead.", { source: { test: "scripts/current/current.test.mjs::Ouro HX takes the new tag's source as the CLI would write it, adds files its items gained, and leaves an edited file alone" }, verify: { testExists: "scripts/current/current.test.mjs::Ouro HX takes the new tag's source as the CLI would write it, adds files its items gained, and leaves an edited file alone" } })}</li>
            <li>{claim("It never names a private repository in public, here or in its run's log.", { source: { test: "scripts/current/current.test.mjs::every installation runs, a failing repository is reported while the rest go on, and a private one is never named in public" }, verify: { testExists: "scripts/current/current.test.mjs::every installation runs, a failing repository is reported while the rest go on, and a private one is never named in public" } })}</li>
          </ul>
        </Container>
      </section>

      <section aria-labelledby="current-who" className="current-section">
        <Container>
          <h2 id="current-who" className="current-h2">
            Who it keeps current
          </h2>
          <p className="current-detail" aria-live="polite">
            Checked <time dateTime={list.generatedAt}>{stamp(list.generatedAt)}</time>, in {list.installations} {list.installations === 1 ? "installation" : "installations"}:{" "}
            {shown} public {shown === 1 ? "repository" : "repositories"} with Ouro UI pins, {open} with an update open. <Link href={LIVE_URL}>current.json</Link>.
            {waiting ? (
              <>
                {" "}
                A newer list is ready, from <time dateTime={waiting.generatedAt}>{stamp(waiting.generatedAt)}</time>.{" "}
                <button
                  type="button"
                  className="current-show"
                  onClick={() => {
                    setList(waiting);
                    setWaiting(null);
                  }}
                >
                  Show it
                </button>
              </>
            ) : null}
          </p>
          {list.repos.length ? (
            <ul className="current-repos">
              {list.repos.map((repo) => (
                <Repo key={repo.repo} repo={repo} />
              ))}
            </ul>
          ) : (
            <p className="current-empty">
              Ouro Current lists a public repository here once it is installed on one. <Link href={INSTALL_URL}>Install it on yours</Link>, and it is listed after the next run.
            </p>
          )}
          {list.privateRepos ? (
            <p className="current-detail">
              And {list.privateRepos} private {list.privateRepos === 1 ? "repository" : "repositories"} it can see, counted here by number only.
            </p>
          ) : null}
        </Container>
      </section>
    </div>
  );
}

export default function OuroCurrent(): JSX.Element {
  return <CurrentPage />;
}
