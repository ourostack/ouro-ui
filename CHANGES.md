# Changes in this release

- Prerendered live examples keep their native form controls disabled until hydration, so early clicks are not lost while the selected example loads; the static content remains readable without JavaScript.
- The shipped SwipeActions native scrolling check starts on the row it verifies and uses a timed swipe, so slow input acknowledgements cannot turn the test gesture into a long press.
