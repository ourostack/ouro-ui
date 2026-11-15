# Changes in this release

- Fix: a Menu that [opens while another is still closing stays open](registry/ouro/components/ouro/menu/menu.test.tsx "verify:testExists(registry/ouro/components/ouro/menu/menu.test.tsx::Menu modal > leaves a menu that opened while another closed open, when the closing one would give focus back to its trigger)"): the closing one no longer gives focus back to its trigger, which closed the new one.
