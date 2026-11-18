# Changes in this release

- Fixed: the test kit's tall-paragraph contrast tests set their own paragraph's height, so they pass in an app whose font sets text narrower than Ouro UI's ([test](registry/ouro/lib/ouro/testing/axe.test.ts "verify:testExists(registry/ouro/lib/ouro/testing/axe.test.ts::audit > keeps the tall paragraph taller than the screen in an app whose font sets text narrow)")).
