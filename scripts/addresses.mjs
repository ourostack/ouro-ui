export { unpinnedAddresses };

/**
 * Install addresses in `text` that name an Ouro UI item without a release tag: with no ref
 * (`ourostack/ouro-ui/dialog`, `ourostack/ouro-ui/<item>`), which installs `main`, or with
 * any other ref (`#main`, a branch, a commit). Public docs pin the newest release
 * (`#vX.Y.Z`, `#${latestRelease}` in the site, `#{{latestRelease}}` in UPGRADING.md) or use @ouro. A sentence that says the address is for
 * contributors may show it. GitHub and Pages URLs are not install addresses. An action's address
 * (`ourostack/ouro-ui/.github/actions/check@vX.Y.Z`) takes its ref after an `@`, and is pinned the same way.
 *
 * Pure, so the Node script tests and the site's browser tests share it.
 */
function unpinnedAddresses(text) {
  const found = [];
  for (const sentence of text.split(/(?<=[.:;])\s+|\n/)) {
    if (/for contributors/i.test(sentence)) continue;
    for (const match of sentence.matchAll(/(?<![\w./-])ourostack\/ouro-ui\/(?:\.github\/actions\/[\w-]+(?:@([\w${}./-]*))?|([\w<>${}.-]+)(?:#([\w${}./-]*))?)/g)) {
      if (match[2] !== undefined && /^(releases|blob|tree|actions|pull|issues)\b/.test(match[2])) continue;
      const ref = (match[1] ?? match[3] ?? "").replace(/\.+$/, "");
      if (!/^(v\d+\.\d+\.\d+|\$\{latestRelease\}|\{\{latestRelease\}\})$/.test(ref)) found.push(match[0].replace(/\.+$/, ""));
    }
  }
  return found;
}
