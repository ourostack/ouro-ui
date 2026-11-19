# Changes in this release

- Fixed: choosing an item from a menu in a linked `Item`'s or `Card`'s `actions` no longer also opens the row's link ([test](registry/ouro/components/ouro/item/item.test.tsx "verify:testExists(registry/ouro/components/ouro/item/item.test.tsx::Item with href > opens nothing from a choice in its actions' menu, which React hands up from the menu's portal outside the row)")).
