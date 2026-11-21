// Loaded with NODE_OPTIONS=--import for the shadcn adds from GitHub in install-test.sh (add_retrying_raw_fetch).
import { withRetry, withTagFallback } from "./raw-fetch-retry.mjs";

globalThis.fetch = withRetry(withTagFallback(globalThis.fetch), { log: (line) => process.stderr.write(`${line}\n`) });
