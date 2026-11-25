# Changes in this release

- Fixed: Ouro check's dropped-frames rule no longer reports a false positive when its live frame-timing read races a concurrent walk() step's own live read (#3503).
- Changed: Capsules are squircles at half their height in engines without corner-shape: OuroProvider now measures them and sets the variables the squircleCorners() plugin leaves waiting, while a switch, a radio, a slider thumb, a presence dot and a spinner stay round.
