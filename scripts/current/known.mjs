// A rule an Ouro check update brings in judges code the repository wrote before the rule existed, so its first run fails
// on findings no pull request of the repository's made (mendelow.me#60: `39` off-theme and off-scale findings from Ouro
// UI v1.3.249). The update pull request records the rule's findings it already has in ouro-check.json's "known", which the
// check reports and passes; any other finding of that rule still fails, so the rule stops new ones from the start.
//
// The findings come from the report the pull request's own checks uploaded (an artifact whose name starts with
// ouro-check), so the run after the one that brought the rule writes them. A finding is recorded as the check's
// knownKey writes it (registry/ouro/check/run.ts).

export const CONFIG = "ouro-check.json";

/** What a finding says up to the token to use, as registry/ouro/check/run.ts's knownKey records it. */
export const knownKey = (detail) => String(detail).split("; use ")[0];

/** The folders of the vendored Ouro check this update writes to: a check/ folder it changes a file of. */
const checkFolders = (files) => [...new Set(Object.keys(files).filter((path) => /(^|\/)check\/[^/]+\.ts$/.test(path)).map((path) => path.slice(0, path.lastIndexOf("/") + 1)))];

const parse = (text) => {
  if (!text) return {};
  try {
    const value = JSON.parse(String(text));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return null;
  }
};

/**
 * ouro-check.json with the findings of the rules this update brings in recorded as known, and how many each rule has;
 * null when the update brings no rule with findings to record.
 *
 * files: the update's files. oldCheck(folder): the repository's own files in that folder, as text, or none when it
 * keeps no check there (a run.ts of its own). reports: the
 * pull request's own Ouro check reports. base and branch: ouro-check.json on the default branch and on the update's
 * branch, as text or null; the branch's keeps what an earlier run recorded while the newest commit's checks still run.
 */
export async function seedKnown({ files, oldCheck, reports, base, branch }) {
  const folders = checkFolders(files);
  if (!folders.length) return null;
  const config = parse(base);
  // A config the check itself could not read is the repository's to fix; the update leaves it alone.
  if (config === null) return null;
  // Only a folder the repository already keeps a check in (a run.ts of its own) is an update of the check.
  const old = (await Promise.all(folders.map(oldCheck))).flat().join("\n");
  // A repository with no check yet takes every rule at once, as it does any new tool.
  if (!old) return null;
  const fresh = folders.flatMap((folder) => Object.entries(files).filter(([path]) => path.startsWith(folder)).map(([, text]) => String(text))).join("\n");
  const brings = (rule) => !old.includes(`"${rule}"`) && fresh.includes(`"${rule}"`);
  const found = new Map();
  for (const finding of reports.flatMap((report) => report?.findings ?? [])) {
    if (!finding?.rule || !brings(finding.rule)) continue;
    found.set(finding.rule, (found.get(finding.rule) ?? new Set()).add(knownKey(finding.detail)));
  }
  for (const [rule, keys] of Object.entries(parse(branch)?.known ?? {})) {
    if (!brings(rule) || !Array.isArray(keys)) continue;
    for (const key of keys) found.set(rule, (found.get(rule) ?? new Set()).add(key));
  }
  const known = { ...(config.known ?? {}) };
  let added = 0;
  for (const [rule, keys] of [...found].sort(([a], [b]) => a.localeCompare(b))) {
    const had = new Set(known[rule] ?? []);
    const all = [...new Set([...had, ...keys])].sort();
    added += all.length - had.size;
    known[rule] = all;
  }
  if (!added) return null;
  return { file: `${JSON.stringify({ ...config, known }, null, 2)}\n`, counts: Object.fromEntries([...found.keys()].map((rule) => [rule, known[rule].length])) };
}

/**
 * The update pull request's part on the Ouro check rules it brings in: each by name, with the release's summary where
 * new-rules.json gives one (`listed`), and the findings recorded as known for it (`seed`, from seedKnown). A rule the
 * release does not list, but whose findings were recorded, is named too.
 */
export function checkRulesSection(listed, seed) {
  const rules = new Map();
  for (const rule of listed) if (!rules.has(rule.rule)) rules.set(rule.rule, rule);
  for (const rule of Object.keys(seed?.counts ?? {}).sort()) if (!rules.has(rule)) rules.set(rule, { rule });
  if (!rules.size) return null;
  const id = (rule) => `ouro-check-${rule.replace(/[^\w-]/g, "-")}`;
  const recorded = (rule) =>
    seed?.counts?.[rule]
      ? `\`${seed.counts[rule]}\` findings this app already has are recorded in \`${CONFIG}\`'s \`known\`: they pass, and a new one fails.`
      : `The findings this app already has are recorded in \`${CONFIG}\`'s \`known\` once this pull request's checks report them: they pass, and a new one fails.`;
  const cited = [...rules.values()].filter((rule) => rule.summary);
  return [
    "### New Ouro check rules",
    "",
    ...[...rules.values()].map((rule) => `- \`${rule.rule}\`: ${rule.summary ? `${rule.summary.replace(/\s+/g, " ").trim()}[^${id(rule.rule)}] ` : ""}${recorded(rule.rule)}`),
    "",
    "Move the recorded findings onto the theme in a pull request of their own.",
    ...(cited.length ? ["", ...cited.map((rule) => `[^${id(rule.rule)}]: ${rule.source} verify:urlOk(${rule.source})`)] : []),
  ].join("\n");
}
