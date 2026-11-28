# Changes in this release

- Fixed: the claims lint on a pull request body skips the marked Agent assessment block, and still fails a claim outside it.
- New: opt-in native-host `useRestingCaret` helper for TextField, TextArea and Composer, including rich text; idle carets become steady and wake before page input. See the [host contract](https://ui.ouroboros.bot/docs/resting-caret/). [Browser regression tests](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/components/ouro/text-field/text-area.resting-caret.test.tsx "verify:testExists(registry/ouro/components/ouro/text-field/text-area.resting-caret.test.tsx::TextArea resting caret > rests after thirty seconds, keeps focus and selection, and inserts the first waking character)").
