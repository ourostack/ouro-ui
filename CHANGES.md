# Changes in this release

- New: The Ouro AX X-ray accepts an [executable stub](registry/ouro/ax/xray.test.mts "verify:testExists(registry/ouro/ax/xray.test.mts::checkSafety accepts an executable stub inside the home or the repository, with a guard)") given as `--env NAME=<path>` in place of a loopback address, when `--guard` proves it is the mock; a stub outside the X-ray's home and the repository, or not executable, fails the check.
