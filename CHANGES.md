# Changes in this release

- New: Ouro AX's `defineCli` takes `command` for a tool with one thing to do, which [runs with no command word](registry/ouro/ax/command.test.mts "verify:testExists(registry/ouro/ax/command.test.mts::a tool with one command reads every token as the command's arguments and flags, with no command word)"): `ouro-images <folder>`. A tool with `commands` still refuses a word it doesn't know.
- The install prepare cache keys on the install scripts only, so a pull request that changes other scripts restores the prepared app.
- Resizable keeps one context value while its panels, labels, sizes and options stay the same, so re-rendering the group leaves memoized content inside it alone.
- Source rules: the corner, switch and hero messages name the squircle corner shape, the Quiet glass tokens and the light and dark hero picture.
