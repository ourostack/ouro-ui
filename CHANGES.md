# Changes in this release

- Fixed: Command's search marks land correctly on a label or description holding a standalone accent (a middle dot, caret, backtick, diaeresis or acute), by folding characters apart and mapping positions back to the text as written.
- Composer takes a `conversation` prop: an uncontrolled composer starts its draft over when it changes, so a draft no longer follows a person into another conversation.
