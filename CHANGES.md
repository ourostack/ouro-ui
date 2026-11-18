# Changes in this release

- Fixed: on a phone, [a `Command` palette whose commands fit on the screen opens a bottom sheet sized to them](registry/ouro/components/ouro/command/command.test.tsx "verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command presentation > sizes a short palette's sheet to its commands below 640px, not full height)"), and keeps that size while results filter.
- CI: `fresh-main` keeps testing a newer main for longer before a burst of merges fails a pull request.
