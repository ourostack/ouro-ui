import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const git = (repo, ...args) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 1 << 28 }).trim();

export const pinFiles = {
  web: "test/fixtures/a2ui/core.json",
  apple: "core-provenance.json",
  windows: "core-provenance.json",
  android: "core-provenance.json",
};

const semver = (tag) => tag.slice(1).split(".").map(Number);
const byVersion = (a, b) => {
  const x = semver(a);
  const y = semver(b);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

export function stat(repo, range) {
  const out = git(repo, "diff", "--numstat", range);
  let files = 0;
  let lines = 0;
  for (const row of out.split("\n").filter(Boolean)) {
    const [add, del] = row.split("\t");
    files += 1;
    lines += (Number(add) || 0) + (Number(del) || 0);
  }
  return { files, lines };
}

export function coreReleases(core) {
  const tags = git(core, "tag", "--list", "v*").split("\n").filter(Boolean).sort(byVersion);
  return tags.map((tag, i) => {
    const date = git(core, "log", "-1", "--format=%cI", `refs/tags/${tag}`);
    const prev = tags[i - 1];
    const commits = prev ? Number(git(core, "rev-list", "--count", `refs/tags/${prev}..refs/tags/${tag}`)) : null;
    const changed = prev ? stat(core, `refs/tags/${prev}..refs/tags/${tag}`) : null;
    return { tag, date, commits, ...changed };
  });
}

export function kitPins(kit, repo, pinFile) {
  const commits = git(repo, "log", "--first-parent", "--reverse", "--format=%H %cI", "--", pinFile)
    .split("\n")
    .filter(Boolean);
  const pins = [];
  let last = null;
  for (const row of commits) {
    const [sha, date] = row.split(" ");
    let tag;
    try {
      tag = JSON.parse(git(repo, "show", `${sha}:${pinFile}`)).coreTag;
    } catch {
      continue;
    }
    if (tag && tag !== last) {
      pins.push({ kit, sha, date, tag });
      last = tag;
    }
  }
  return pins;
}

export function measure(repos) {
  const releases = coreReleases(repos.core);
  const dates = new Map(releases.map((r) => [r.tag, r.date]));
  const rows = [];
  for (const kit of Object.keys(pinFiles)) {
    const pins = kitPins(kit, repos[kit], pinFiles[kit]);
    pins.forEach((pin, i) => {
      const prev = pins[i - 1];
      const coreDate = dates.get(pin.tag);
      if (!coreDate) return;
      const lagDays = (Date.parse(pin.date) - Date.parse(coreDate)) / 864e5;
      const since = prev
        ? Number(git(repos[kit], "rev-list", "--first-parent", "--count", `${prev.sha}..${pin.sha}`))
        : null;
      const bump = stat(repos[kit], `${pin.sha}^..${pin.sha}`);
      const firstTag = git(repos[kit], "tag", "--contains", pin.sha, "--sort=creatordate")
        .split("\n")
        .find((t) => t && !t.includes("-"));
      const releaseLagDays = firstTag
        ? Math.round(((Date.parse(git(repos[kit], "for-each-ref", "--format=%(creatordate:iso-strict)", `refs/tags/${firstTag}`)) - Date.parse(coreDate)) / 864e5) * 10) / 10
        : null;
      rows.push({
        kit,
        adoption: i === 0,
        tag: pin.tag,
        coreDate,
        pinDate: pin.date,
        kitRelease: firstTag ?? null,
        releaseLagDays,
        lagDays: Math.round(lagDays * 10) / 10,
        commitsSincePreviousPin: since,
        bumpFiles: bump.files,
        bumpLines: bump.lines,
      });
    });
  }
  return { releases, rows };
}

export function median(values) {
  const v = values.filter((x) => x !== null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function summary(rows) {
  return Object.keys(pinFiles).map((kit) => {
    const all = rows.filter((r) => r.kit === kit);
    const mine = all.filter((r) => !r.adoption);
    return {
      kit,
      pins: all.length,
      bumps: mine.length,
      currentPin: all[all.length - 1].tag,
      medianLagDays: median(all.map((r) => r.lagDays)),
      maxLagDays: Math.max(...all.map((r) => r.lagDays)),
      medianReleaseLagDays: median(all.map((r) => r.releaseLagDays)),
      maxReleaseLagDays: Math.max(...all.map((r) => r.releaseLagDays ?? 0)),
      pinsReleased: all.filter((r) => r.kitRelease).length,
      maxBumpLines: Math.max(...mine.map((r) => r.bumpLines)),
      medianBumpFiles: median(mine.map((r) => r.bumpFiles)),
      medianBumpLines: median(mine.map((r) => r.bumpLines)),
      medianCommitsBetweenPins: median(mine.map((r) => r.commitsSincePreviousPin)),
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")),
  );
  const need = ["core", ...Object.keys(pinFiles)];
  const missing = need.filter((k) => !args[k]);
  if (missing.length) {
    console.error(
      `Usage: node scripts/upkeep/measure.mjs ${need.map((k) => `--${k}=<checkout>`).join(" ")} [--out=<file>]`,
    );
    process.exit(1);
  }
  const result = measure(args);
  const latest = result.releases[result.releases.length - 1].tag;
  const out = { latestCoreTag: latest, releasesTotal: result.releases.length, summary: summary(result.rows), ...result };
  if (args.out) writeFileSync(args.out, JSON.stringify(out, null, 2) + "\n");
  else console.log(JSON.stringify(out, null, 2));
}
