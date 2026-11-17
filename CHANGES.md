# Changes in this release

- Fixed: Ouro Current's update adds the items an updated component now depends on, as the shadcn CLI follows `registryDependencies`, so an app gets the new `lib/ouro/platform.ts` that an updated kbd imports.
- Fixed: Ouro Current moves a copied core `dist-manifest.json` only with the files it lists. When one was edited here or is no longer shipped, the set stays as it is and the update says why; an update held back whole is logged as skipped instead of opening a pull request.
- Fixed: a vendored source that names its release as `tag` (as ouro-work-substrate's lock does) has it moved with its commit, as `release` already was.
