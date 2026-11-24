# Changes in this release

- Changed: Chat bubbles no longer draw one sharper tail corner; a lone bubble has equal corners, and in a run of consecutive messages from one sender the corners where bubbles meet are slightly less round (`--ouro-message-joined-radius`, `--radius-ouro-xl` unless set) with `--ouro-message-run-gap` (`--ouro-size-1` unless set) between them.
