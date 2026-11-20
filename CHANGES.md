# Changes in this release

- Fixed: the first-run harness's [account button check waits out a window still starting](scripts/check/first-run-session.test.mts "verify:testExists(scripts/check/first-run-session.test.mts::first-run harness: signed out > waits out a window still starting before it presses the account button, within the progress limit)"): while the window shows its own progress state, the button is pressed once the window has drawn it, within `progressWithinMs`, where the check failed at once with "there was no enabled account button to press".
