#!/usr/bin/env node
// A CLI with no help JSON, for xray.test.mts: the X-ray reads its commands and exit codes from the overview text.
// $PLAIN_MODE: "long" prints an overview past one screen; "nousage" names no usage exit code.
const argv = process.argv.slice(2);
const mode = process.env.PLAIN_MODE ?? "";
if (argv[0] === "--help" && argv.length === 1) {
  const extra = mode === "long" ? Array.from({ length: 70 }, (_, i) => `note ${i}`) : [];
  process.stdout.write(["plain: a fixture.", "", "  look    Look at things.", "  watch   Wait for something.", ...extra, "", mode === "nousage" ? "Exit codes: 0 ok, 1 error." : "Exit codes: 0 ok, 1 error, 2 usage."].join("\n") + "\n");
  process.exit(0);
}
if (argv.includes("--help")) {
  process.stdout.write(`plain ${argv[0]}\n`);
  process.exit(0);
}
process.stderr.write(`plain: no such thing "${argv[0]}"\n`);
process.exit(1);
