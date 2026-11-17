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

/** The folders of the vendored Ouro check this update writes: those holding a check's run.ts. */
const checkFolders = (files) => [...new Set(Object.keys(files).filter((path) => /(^|\/)check\/run\.ts$/.test(path)).map((path) => path.slice(0, -"run.ts".length)))];

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
 * ouro-check.json with the findings of the rules this update brings in recorded as known, and the note that says so;
 * null when the update brings no rule with findings to record.
 *
 * files: the update's files. oldCheck(folder): the repository's own files in that folder, as text. reports: the
 * pull request's own Ouro check reports. base and branch: ouro-check.json on the default branch and on the update's
 * branch, as text or null; the branch's keeps what an earlier run recorded while the newest commit's checks still run.
 */
export async function seedKnown({ files, oldCheck, reports, base, branch }) {
  const folders = checkFolders(files);
  if (!folders.length) return null;
  const config = parse(base);
  // A config the check itself could not read is the repository's to fix; the update leaves it alone.
  if (config === null) return null;
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
  const rules = [...found.keys()].sort();
  const named = rules.map((rule) => `\`${rule}\``);
  const list = named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named.at(-1)}` : named[0];
  const count = rules.reduce((sum, rule) => sum + known[rule].length, 0);
  return {
    file: `${JSON.stringify({ ...config, known }, null, 2)}\n`,
    note: `Records the \`${count}\` findings of ${list}, which this update brings in, in \`${CONFIG}\`'s \`known\`: they pass, and a new finding of ${rules.length > 1 ? "those rules" : "that rule"} fails. Move them onto the theme and its spacing scale in a pull request of its own.`,
  };
}
