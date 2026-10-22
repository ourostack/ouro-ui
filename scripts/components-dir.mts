// Where the registry's components live, from the repository root. No imports, so the site can
// bundle it: scripts/components.mts reads the manifests there, and site/src/docs/item-details.ts
// builds each item's source path from it, as scripts/gen-docs.mts writes them.

/** The components' folder, from the repository root, with its trailing slash. */
export const componentsDir = "registry/ouro/components/ouro/";
