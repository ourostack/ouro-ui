# Ouro AX census

The Ouro AX census finds the agent doors a product has in its own code, declared or not, and fails CI when a door without a valid card is new.[^new-gap] An agent door is anything an agent uses to act or read: an MCP tool, a CLI command, an in-turn model tool, an approval prompt, and the kinds a product's own walkers add (skills, hooks, HTTP routes). It is not the registry's `ouro-census` kit, which counts the controls on an app's pages.

It started in the harness (`ourostack/ouroboros`, `.github/scripts/ax-census/`) and lives here so products can run the same checker. A product copies these files (the list and their hashes are in `dist-manifest.json`), keeps its own `ax/census.config.json` and `ax/census.baseline.json`, and runs it as a step in its AX job.

## What it checks

- **Doors**, found by walkers that read the product's code and lists rather than calling a door. The built-in walkers are `mcp-schemas` (MCP tools from a server's exported `getToolSchemas()`), `ts-parser` (a hand-written TypeScript argv parser), `argv-entries` (modules that read `process.argv`), and `tool-schemas` (in-turn tool schemas and the approval prompts their definitions ask for).
- **Cards.** A door is declared when it has an `ax` card with a group, a one-line `when`, an effect and errors written for the agent. A card that fails a quality check is weak, and a weak door is a gap like an undeclared one.[^weak]
- **The baseline**, which lists today's gaps and only shrinks. A gap not on it fails, an entry that is no longer a gap fails, and a pull request that adds an entry or drops a walker source fails. The census takes no flag or label to let a gap through.[^ratchet]

The walkers run in one child process with an empty `HOME` and `TMPDIR`, without credentials, and with a guard that refuses connections beyond loopback.[^isolation] A child that crashes, hangs past 10 seconds or prints nothing fails the census.[^child]

## Booklet words

A product can adopt one more weak-card check, booklet words: text that gives the reading agent a rule instead of saying what the door does. It comes from the Butler's productionization spec. It flags "always", "never", "do not", "use this whenever" and "you must" as whole words, quoted or not, in a door's description, its card's `when` and its errors' `fix` lines.[^booklet] The spec also asks for tool results, runtime rejections and prompts to be checked; this check reads card texts only. A product adopts it in its config:

```json
{ "bookletWords": { "allow": [{ "door": "tool:shell", "field": "when", "word": "never", "reason": "Says what the tool does: it never runs as root." }] } }
```

The pull request that adopts it may put the doors it alone makes weak on the baseline, and no door weak for another reason.[^booklet-seed] That pull request is a one-time window, like the one that adds a product walker, so its reviewer checks that it adds or rewords nothing else. After that, it works like the other checks:

- a booklet word is a gap until the text is rewritten;
- the base branch's check can't be turned off;
- the allowlist only shrinks;
- an allowlist entry whose text no longer says its word fails.[^booklet-ratchet]

An entry names a door, a field and a word, with the reviewed reason.[^booklet-allow] A `fix` entry names the door, not one error, so it lets the word stand on any of that door's fix lines.[^booklet-allow]

## Running it

```sh
node scripts/ouro-census/census.mts --config ax/census.config.json --baseline ax/census.baseline.json \
  --base-baseline <file|none> --base-config <file|absent> \
  [--out census.json] [--inventory inventory.json] [--commit <sha>] [--ref <ref>] [--repo <owner/name>]
```

In a pull request, pass the base commit's copies of the config and baseline: `node scripts/ouro-census/base.mts` prints the commit the merge ref was built on. Outside a pull request, pass `none` and `absent`. The walkers use the product's own `typescript` dependency.

## A product's own walkers

A product adds a walker for doors the built-in ones don't know without editing these files. It names the walker under `walkers` in its config and uses that name in a source:

```json
{
  "product": "desk",
  "walkers": { "desk-skills": { "module": "ax/walkers/skills.mts", "kinds": ["skill"] } },
  "sources": [{ "walker": "desk-skills", "module": "", "source": "plugins/desk/skills" }],
  "groups": []
}
```

The module exports `walk`, a `Walker` from `types.mts`: it gets the source's options and returns `{ doors, errors }`. It runs in the same guarded child, and may return doors of its declared kinds only; any other door is a census error. The rules:

- It can't take a built-in walker's name, share another walker's module, or walk `unwalked`, the census's own kind.
- It can't exclude a hit. Exclusions are a closed list that only the built-in walkers make.
- Like a source, a walker the base branch has can't be dropped, moved to another module or lose a kind.
- Only the pull request that adds a walker may put its doors on the baseline. A walker the base already has can't take on a kind and list that kind's doors as gaps.

The report lists product walkers with their kinds and module hashes under `checker.walkers`, beside the built-in checker's own hash.[^hash] That hash vouches for the built-in walkers only: the ledger counts a kind a product walker walks once that walker's hash is on its reviewed list.

## The release manifest

`dist-manifest.json` pins the files a product copies, and `checker` is the hash a report carries as `checker.sha256`.[^manifest] The adoption ledger is to accept a product's census only when that hash matches a released manifest, so a product can't weaken a walker and keep reporting. After changing any file here, run `node scripts/ouro-census/manifest.mts --write` and commit the result; `scripts/ouro-census.test.mjs` fails when it is out of date.

## Tests

`node --test scripts/ouro-census.test.mjs` type-checks the census and runs its tests under coverage. The tests that walk a real harness run when `OURO_CENSUS_HARNESS` names a built `ourostack/ouroboros` checkout, and are skipped otherwise.

[^new-gap]: scripts/ouro-census/census.node-test.mts verify:testExists(scripts/ouro-census.test.mjs::the census's tests pass and cover every line and function of the census) verify:fileLine(scripts/ouro-census/census.node-test.mts, /a new tool with no card fails the census/)
[^weak]: scripts/ouro-census/census.node-test.mts verify:testExists(scripts/ouro-census.test.mjs::the census's tests pass and cover every line and function of the census) verify:fileLine(scripts/ouro-census/census.node-test.mts, /a door with a weak card is a gap with its reasons/)
[^ratchet]: scripts/ouro-census/baseline.node-test.mts verify:testExists(scripts/ouro-census.test.mjs::the census's tests pass and cover every line and function of the census) verify:fileLine(scripts/ouro-census/baseline.node-test.mts, /growing the baseline against the base fails/) verify:fileLine(scripts/ouro-census/census.mts, /const USAGE/)
[^isolation]: scripts/ouro-census/census.node-test.mts verify:testExists(scripts/ouro-census.test.mjs::the census's tests pass and cover every line and function of the census) verify:fileLine(scripts/ouro-census/census.node-test.mts, /the guard refuses a non-loopback connection/) verify:fileLine(scripts/ouro-census/census.node-test.mts, /the child runs with an empty HOME and no credentials/)
[^child]: scripts/ouro-census/census.node-test.mts verify:testExists(scripts/ouro-census.test.mjs::the census's tests pass and cover every line and function of the census) verify:fileLine(scripts/ouro-census/census.node-test.mts, /a child that crashes fails the census/) verify:fileLine(scripts/ouro-census/census.node-test.mts, /a child that hangs fails after 10 seconds/) verify:fileLine(scripts/ouro-census/census.node-test.mts, /a child that prints nothing fails the census/)
[^hash]: scripts/ouro-census/census.node-test.mts verify:testExists(scripts/ouro-census.test.mjs::the census's tests pass and cover every line and function of the census) verify:fileLine(scripts/ouro-census/census.node-test.mts, /the report hashes its file/)
[^manifest]: scripts/ouro-census/manifest.node-test.mts verify:testExists(scripts/ouro-census.test.mjs::the census's tests pass and cover every line and function of the census) verify:fileLine(scripts/ouro-census/manifest.node-test.mts, /the committed manifest pins every vendored file by hash/)
[^booklet]: scripts/ouro-census/cards.node-test.mts verify:testExists(scripts/ouro-census.test.mjs::the census's tests pass and cover every line and function of the census) verify:fileLine(scripts/ouro-census/cards.node-test.mts, /booklet words in a card's when, its fixes or the door's description are weak once the product adopts the rule/)
[^booklet-ratchet]: scripts/ouro-census/census.node-test.mts verify:testExists(scripts/ouro-census.test.mjs::the census's tests pass and cover every line and function of the census) verify:fileLine(scripts/ouro-census/census.node-test.mts, /booklet words: a product adopts the rule in one pull request, seeding its baseline, and can't drop it or grow its allowlist after/)
[^booklet-seed]: scripts/ouro-census/census.node-test.mts verify:testExists(scripts/ouro-census.test.mjs::the census's tests pass and cover every line and function of the census) verify:fileLine(scripts/ouro-census/census.node-test.mts, /the adopting pull request seeds only the doors the rule alone makes weak/)
[^booklet-allow]: scripts/ouro-census/cards.node-test.mts verify:testExists(scripts/ouro-census.test.mjs::the census's tests pass and cover every line and function of the census) verify:fileLine(scripts/ouro-census/cards.node-test.mts, /a reviewed allowlist entry lets one booklet word stand on one door's field/)
