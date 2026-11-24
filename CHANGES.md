# Changes in this release

- Fixed: the AppWindow footer keeps the built-with names a full step apart.
- Fixed: [Command's results end on a whole row or heading](registry/ouro/components/ouro/command/command.rows.test.tsx "verify:testExists(registry/ouro/components/ouro/command/command.rows.test.tsx::Command rows > ends the list on a whole row or heading at rest, never through one, at any height and with or without groups)"), cutting the list to the last bottom edge that fits instead of showing half a row at the bottom.
