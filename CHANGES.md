# Changes in this release

- Fixed: [pull request checks finish sooner](scripts/shard.test.mjs "verify:testExists(scripts/shard.test.mjs::CI's browser shards: every file runs exactly once, and no shard's total time is over its share by more than 30 s)"): the browser shards that also run an installed-subset check now take fewer tests, and the design check runs in 12 shards.
