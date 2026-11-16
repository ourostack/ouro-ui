// StallReporter as a default export, which Vitest's --reporter=<path> instantiates: the install test's shards add it to the
// installed app's own run in CI (scripts/install-test.sh), so a hang there fails in minutes and names what hung (#671).
export { StallReporter as default } from "./stall-reporter.mts";
