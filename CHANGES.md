# Changes in this release

- Fixed: Ouro Current vendors the shared Ouro AX files that a vendored kit imports as `#ouro-ax/*`, and adds that import to the package.json Node resolves it through, pointed at the vendored folder, so a repository that vendors Ouro AX by lock runs its X-ray after an update.
- Fixed: the agent quickstart runs Ouro check from scripts/ouro/check, where the ouro-check item now installs it, with the package.json import line it needs.
