# Changes in this release

- Fixed: [Composer's rich-mode highlights no longer throw `IndexSizeError` when a mark ends inside inline code](registry/ouro/components/ouro/composer/composer.rich.test.tsx "verify:testExists(registry/ouro/components/ouro/composer/composer.rich.test.tsx::Composer rich mode highlights > marks a draft an agent sets from outside the editor, ending in a list's inline code, without throwing)"), since code-formatted text nests its DOM text node inside an extra wrapper element that the old code mistook for the text node itself.
