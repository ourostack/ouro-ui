export { unpinnedAddresses };

/**
 * Install addresses in `text` that name an Ouro UI item without a ref
 * (`ourostack/ouro-ui/dialog`, `ourostack/ouro-ui/<item>`), which install `main`. Public
 * docs pin the newest release or use @ouro. A sentence that says the address is for
 * contributors may show it. GitHub and Pages URLs are not install addresses.
 *
 * Pure, so the Node script tests and the site's browser tests share it.
 */
function unpinnedAddresses(text) {
  const found = [];
  for (const sentence of text.split(/(?<=[.:;])\s+|\n/)) {
    if (/for contributors/i.test(sentence)) continue;
    for (const match of sentence.matchAll(/(?<![\w./-])ourostack\/ouro-ui\/([\w<>${}.-]+)(#\S*)?/g)) {
      if (!match[2] && !/^(releases|blob|tree|actions|pull|issues)\b/.test(match[1])) found.push(match[0]);
    }
  }
  return found;
}
