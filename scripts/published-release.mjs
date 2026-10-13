// What people and agents read after a release must name it: the site's llms.txt
// (https://ourostack.github.io/ouro-ui/llms.txt, which Pages builds) and the README on main.
// v0.7.0 was out for two hours while both still gave install commands for v0.6.0.
//
//   node scripts/published-release.mjs <tag> [--wait <seconds>]
//
// fetches both and fails (a GitHub ::error:: line each, exit 1) when one names another
// release than <tag> in an install address, or names none. With --wait it keeps trying for
// that long first, because Pages and its cache take minutes to show a deploy. release.yml
// runs it as its last step, and scheduled-install.yml every week.
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { releaseMismatches } from "./latest-release.mjs";

/** Where each published page is read from: the site's llms.txt, and main's README through the API (no cache). */
export function sources(repo) {
  const [owner, name] = repo.split("/");
  return {
    "llms.txt": `https://${owner}.github.io/${name}/llms.txt`,
    "README.md": `https://api.github.com/repos/${repo}/contents/README.md?ref=main`,
  };
}

/** Why the published pages (`{ name: text }`) do not name `tag`, one line per page; none when they do. */
export function publishedProblems(pages, tag) {
  return Object.entries(pages).flatMap(([name, text]) => {
    const wrong = releaseMismatches(text, tag);
    if (wrong.length > 0) return [`${name} names another release than ${tag} (line ${wrong[0]}${wrong.length > 1 ? `, and ${wrong.length - 1} more` : ""}).`];
    return text.includes(`#${tag}`) ? [] : [`${name} names no release: it has no install address ending in #${tag}.`];
  });
}

async function read(repo) {
  const pages = {};
  for (const [name, url] of Object.entries(sources(repo))) {
    const api = url.startsWith("https://api.github.com/");
    const headers = api
      ? { Accept: "application/vnd.github.raw", ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) }
      : {};
    // A query string the cache has not seen, so Pages serves the newest deploy.
    const response = await globalThis.fetch(api ? url : `${url}?t=${Date.now()}`, { headers });
    pages[name] = response.ok ? await response.text() : `HTTP ${response.status}`;
  }
  return pages;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [tag, ...rest] = process.argv.slice(2);
  if (!/^v\d+\.\d+\.\d+$/.test(tag ?? "")) throw new Error("usage: published-release.mjs v<x.y.z> [--wait <seconds>]");
  const wait = rest[0] === "--wait" ? Number(rest[1]) * 1000 : 0;
  const repo = process.env.GITHUB_REPOSITORY ?? "ourostack/ouro-ui";
  const deadline = Date.now() + wait;
  let problems = publishedProblems(await read(repo), tag);
  while (problems.length > 0 && Date.now() < deadline) {
    await sleep(20_000);
    problems = publishedProblems(await read(repo), tag);
  }
  for (const problem of problems) console.log(`::error::${problem}`);
  if (problems.length > 0) {
    console.log(`The site's llms.txt follows the newest release when Pages deploys (run the Pages workflow on main); main's README follows it when the "Prepare main for the next release" pull request merges.`);
    process.exit(1);
  }
  console.log(`The published llms.txt and README name ${tag}.`);
}
