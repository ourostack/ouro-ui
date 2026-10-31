# Ouro AX: a standard with an X-ray

Ouro AX is a set of checkable claims about an interface whose user is an agent, and `ax-xray`, a checker that runs them against any CLI, HTTP API or MCP server from outside, without importing its code. Adoption is proven by the X-ray, not by which library built the interface. Ouro HX's Inspector shows which Ouro component is where on a page; the AX X-ray shows which AX claim holds on which command, route or tool, and the fix for each one that fails.

This folder is the `ax-probe/xray` probe: one candidate design for Ouro AX v1, not a release.

## The standard

[`claims.json`](claims.json) holds the claims. Each has an `id`, the `surface` it applies to (`cli`, `http` or `mcp`), a `severity` (`must` or `should`), the `rule`, its `rationale`, its `source` (Tandem's AX principles and the Ouro UI design record of October 11), the mechanical `check`, and the `fix`. Print them with:

```sh
node ax/xray.mjs claims          # or: claims --json
```

## The X-ray

```sh
node ax/xray.mjs --cli "<command>" [--http <url> --routes <manifest.json>] [--mcp "<command>"] \
  [--state "<args>"]... [--env K=V]... [--guard "<command>"] [--json] [--md <file>] [--html <file>]
```

- `--cli`: reads `help --json` for the commands and who sees each (`effect: private | others`), then calls every command's `--help`, every read with `--json`, unknown commands and flags, ambiguous verbs, and each command others see with a made-up target, with and without `--why`.
- `--http` with `--routes`: GETs every read route, the base path's index and an unknown route, and sends the refused probes the manifest names (`others`: a made-up target, without and then with the why field).
- `--mcp`: initializes over stdio, lists the tools, calls each tool that has required arguments with none, and calls a tool that does not exist.
- `--state`: CLI arguments whose output is the state reads must not change; the X-ray compares it before and after the reads, and around each refused call.
- `--guard`: a command that must exit 0 before anything runs; Tandem's runner passes its mock-only guard.

It is safe by construction. It runs reads freely. It calls a command other people see only with a made-up target (so it must be refused) or with `--dry-run` when that command's own help offers it. Over HTTP it sends only GET requests and the refused probes the manifest names.

The report lists, per claim, how many surfaces hold it, and for each failure the call it made, what came back, and the fix. `--md` and `--html` write the same report as a page: a claim list, then a grid of every surface against every claim.

Run its tests with `node --test ax/xray.test.mjs`. The fixtures are a CLI that holds every claim, one that breaks them, and an MCP server with one good and one bad tool.

## Tandem, the first adopter

Tandem's runner X-rays `m365tandem` and the agent port against the mock daemon only:

```sh
node ax/manifests/tandem-routes.mjs <tandem checkout> > ax/manifests/tandem.json   # the routes, from src/model/protocol.ts
cd <tandem checkout> && node probe/ax-xray/run.ts <this checkout> <mock TANDEM_URL> --md report.md --html report.html
```

[`reports/`](reports/) holds the X-ray of Tandem main at the probe's branch point and of the probe's fixes.

## Does it predict outcomes?

Only partly, and only once the claims came from agent failures: [agent-evidence.md](reports/agent-evidence.md). Standard 0.1's failures on Tandem main predicted none of the baseline's wrong turns, and fixing them changed no outcome. Two claims added from the baseline's failures (`cli.text-as-argument`, `cli.wait-on-refs`) named most of them, and fixing those took the same agent from 5 of 10 tasks to 10 of 10. The X-ray says exactly whether a claim holds; an agent evaluation says whether the claim matters.

## How it would ship

- `ax-claims`: the standard, as a registry item an app copies in or reads by tag.
- `ax-xray`: the checker, a zero-dependency Node script, as a registry item like `lib-claims`, plus a CI step that fails on a `must` claim.
- A rule for the standard: a claim enters when an agent evaluation shows the failure it names, and leaves when it never moves an outcome.
- The report page, published beside the HX docs, one per adopter.
