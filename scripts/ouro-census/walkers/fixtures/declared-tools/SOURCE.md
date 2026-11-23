# Declared tools fixture

`tools.json` is ourostack/ouro-ui-core's `test/fixtures/actions/generated-tools/tools.json` at tag v1.11.0, byte for byte: what the ouro-actions-tools projection writes for core's synthetic shopping action set. ourostack/ouroboros keeps the same file as `src/__tests__/repertoire/fixtures/declared-tools/tools.json`.

The `.cjs` files stand in for the bundle MCP server that serves those tools:

- `server.cjs` serves the four declared tools and `clear_shopping_list`, which `tools.json` doesn't name.
- `server-short.cjs` serves three of them, so `share_shopping_list` is declared but not served.
- `server-bad.cjs` serves a tool with no name, and `get_shopping_list` twice.
- `person-only.json` is `tools.json` with `share_shopping_list` declared `person-only`, which the harness never surfaces to an agent.
- `incomplete.json` is `tools.json` with `share_shopping_list` declared `person-only` but with no `when` line, so it isn't a whole declaration.
- `minified.json` is `tools.json` on one line.
