# Changes in this release

- Fix: Tab pressed straight after Command opens [keeps focus where it moved](registry/ouro/components/ouro/command/command.test.tsx "verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command opened by a key > leaves focus where Tab moved it %s, before a frame is drawn (keepMounted %s))"): Base UI no longer focuses the search a frame after Command already has, which pulled focus back from the close button.
