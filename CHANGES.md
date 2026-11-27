# Changes in this release

- Fix: Composer's rich mode now sends on a plain Enter even when the browser still reports `isComposing` true, once the rich editor has itself seen the word commit without a `compositionend` (ourostack/ouro-ui#3843).
