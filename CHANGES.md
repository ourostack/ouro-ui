# Changes in this release

- Fixed: the adoption page's "since" line reads the day before from the ledger itself (`previous`, written by the hourly run), so it no longer waits on GitHub's unsigned API limit and shows up for readers who hit it.
