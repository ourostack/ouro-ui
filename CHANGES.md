# Changes in this release

- Fixed: The claims check, the install script and the commands in the upgrade guide read standard input asynchronously, so a pipe that delivers short reads no longer crashes them on newer Node.
- Select: its trigger is a [`<div role="combobox">`](registry/ouro/components/ouro/select/select.tsx "verify:fileLine(registry/ouro/components/ouro/select/select.tsx, /render=\{<div \/>\}/)"), not a `<button>`, so VoiceOver reads its whole value; on a button it dropped the last three characters, a WebKit bug (ourostack/ouro-ui#113).
- Toaster: a stack moved clear of keyboard focus [lands on the next frame when the browser runs no fade](registry/ouro/lib/ouro/keep-focus-clear.test.ts "verify:testExists(registry/ouro/lib/ouro/keep-focus-clear.test.ts::keepFocusClear > the fade > lands a move on the next frame when no fade starts, without waiting for the fallback)"), rather than after the fade's fallback wait.
