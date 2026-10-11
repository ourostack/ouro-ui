export { unpinnedAddresses };

/**
 * Install addresses in `text` that name an Ouro UI item without a release tag: with no ref
 * (`ourostack/ouro-ui/dialog`, `ourostack/ouro-ui/<item>`), which installs `main`, or with
 * any other ref (`#main`, a branch, a commit). Public docs pin the newest release
 * (`#vX.Y.Z`, `#${latestRelease}` in the site, `#{{latestRelease}}` in UPGRADING.md) or use @ouro. A sentence that says the address is for
 * contributors may show it. GitHub and Pages URLs are not install addresses.
 *
 * Pure, so the Node script tests and the site's browser tests share it.
 */
function unpinnedAddresses(text) {
  const found = [];
  for (const sentence of text.split(/(?<=[.:;])\s+|\n/)) {
    if (/for contributors/i.test(sentence)) continue;
    for (const match of sentence.matchAll(/(?<![\w./-])ourostack\/ouro-ui\/([\w<>${}.-]+)(?:#([\w${}./-]*))?/g)) {
      if (/^(releases|blob|tree|actions|pull|issues)\b/.test(match[1])) continue;
      const ref = (match[2] ?? "").replace(/\.+$/, "");
      if (!/^(v\d+\.\d+\.\d+|\$\{latestRelease\}|\{\{latestRelease\}\})$/.test(ref)) found.push(match[0].replace(/\.+$/, ""));
    }
  }
  return found;
}
