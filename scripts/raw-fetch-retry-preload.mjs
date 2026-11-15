// Loaded with NODE_OPTIONS=--import for the shadcn add in install-test.sh's github variant.
import { withRetry } from "./raw-fetch-retry.mjs";

globalThis.fetch = withRetry(globalThis.fetch, { log: (line) => process.stderr.write(`${line}\n`) });
