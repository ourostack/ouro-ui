# Changes in this release

- Fix: MessageList's fling settles only once the reader's scroll itself ends, not partway through a long frame that reads a jump-sized distance before its own scroll event catches up.
