# Ouro AX census

The Ouro AX census finds every agent door a product has in its own code, declared or not, and fails CI when a door without a valid card is new. An agent door is anything an agent uses to act or read: an MCP tool, a CLI command, an in-turn model tool, an approval prompt, and the kinds a product's own walkers add (skills, hooks, HTTP routes). It is not the registry's `ouro-census` kit, which counts the controls on an app's pages.

It started in the harness (`ourostack/ouroboros`, `.github/scripts/ax-census/`) and lives here so every product can run the same checker. A product copies these files (the list and their hashes are in `dist-manifest.json`), keeps its own `ax/census.config.json` and `ax/census.baseline.json`, and runs it as a step in its AX job.

## What it checks

- **Doors**, found by walkers that read the product's code and lists, never by calling a door. The built-in walkers are `mcp-schemas` (MCP tools from a server's exported `getToolSchemas()`), `ts-parser` (a hand-written TypeScript argv parser), `argv-entries` (modules that read `process.argv`), and `tool-schemas` (in-turn tool schemas and the approval prompts their definitions ask for).
- **Cards.** A door is declared when it has an `ax` card with a group, a one-line `when`, an effect and errors written for the agent. A card that fails a quality check is weak, and weak counts against zero.
- **The baseline**, which lists today's gaps and only shrinks. A gap not on it fails, an entry that is no longer a gap fails, and a pull request that adds an entry or drops a walker source fails. There is no override.

All walkers run in one child process with an empty `HOME` and `TMPDIR`, no credentials, and a guard that refuses any connection beyond loopback. A child that crashes, hangs past 10 seconds or prints nothing fails the census.

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

The report lists each product walker with its kinds and its module's SHA-256 under `checker.walkers`, beside the built-in checker's own hash. That hash vouches for the built-in walkers only: the ledger counts a kind a product walker walks once that walker's hash is on its reviewed list.

## The release manifest

`dist-manifest.json` pins every file a product copies, and `checker` is the hash a report carries as `checker.sha256`. The adoption ledger is to accept a product's census only when that hash matches a released manifest, so a product can't weaken a walker and keep reporting. After changing any file here, run `node scripts/ouro-census/manifest.mts --write` and commit the result; `scripts/ouro-census.test.mjs` fails when it is out of date.

## Tests

`node --test scripts/ouro-census.test.mjs` type-checks the census and runs its tests under coverage. The tests that walk a real harness run when `OURO_CENSUS_HARNESS` names a built `ourostack/ouroboros` checkout, and are skipped otherwise.
