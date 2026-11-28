# Resting caret

Let a native host quiet a focused editor while the person reads, without losing their place. Use the `restingCaret` policy on [TextField](../TextField.md), [TextArea](../TextArea.md) or [Composer](../Composer.md); leave it unset on ordinary web pages.

## Permission comes from the host

Enable this only in a native host that can meet the whole contract below. Do not copy the demo's simulated permission into an app.

- Keep `enabled` false when assistive technology or voice input is on, or its state is unknown. Do not infer this permission from reduced motion.
- Supply `subscribeWake(wake)`, returning an unsubscribe function. Call `wake()` synchronously before opening a native editing menu, delivering dictation, inserting from a character palette or forwarding other native input.
- Supply `onHeld(held)`. While held, intercept native input-method keys before the engine receives them, request a wake and forward the keys only after `onHeld(false)`. Include dead keys, modifier keys and the Globe key.
- Pass `occluded` when the host knows the window is covered or minimised.
- Keep both callbacks stable. Keep the policy object present when disabling it: change `enabled`, rather than adding and removing the prop.

Engines that support `caret-animation: manual` keep their own steady caret without changing editability.[^native-animation] Other engines temporarily change the editor's editability, not just its caret colour. That fallback is why a host bridge is required: input that bypasses page events needs to wake the editor first. A browser page cannot establish that contract by itself.

```tsx
<TextArea
  label="Draft"
  autoGrow
  restingCaret={{
    enabled: host.caretRestPermitted,
    occluded: host.windowCovered,
    subscribeWake: host.subscribeCaretWake,
    onHeld: host.setCaretHeld,
  }}
/>
```

These are methods supplied by your host, not browser APIs. For an app without this bridge, omit `restingCaret`.

## A quiet place to return to

After thirty seconds without editing input, the focused editor shows a steady caret for a collapsed selection.[^idle] Typing wakes it in capture phase, before the page's input handlers run; pointer movement and scrolling do not wake it.[^idle]

A composing word stays editable, and changing the host's permission to false releases a hold. A caller's own `readOnly` remains the caller's.[^safety] Native input types that expose no text selection keep their own caret.[^native]

Page visibility and the host's cover signal also control the hold. A hidden page draws no replacement caret; an unfocused window keeps the engine's own caret behaviour.[^visibility] The editor's `data-caret-rest` attribute exposes the current reason for inspection.

The fallback's steady caret is decoration, hidden from assistive technology. Text selection, including its direction, stays in the original control.[^selection] Waking from the fallback starts a new native typing run; do not promise a single undo group across a rest.

Try **Try quiet reading** in the [TextArea demo](https://ui.ouroboros.bot/docs/text-area/), then type without clicking the field again. Do not use this simulated host as an accessibility detector.

## Prior art

Borrow the idle hold and host-wake contract from a consuming app, with permission kept explicit rather than enabled for the open web. Adopt the CSS [`caret-animation: manual`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/caret-animation) property where supported: the engine owns its caret, with no replacement to position.[^native-animation][^css]

[^idle]: registry/ouro/components/ouro/text-field/text-area.resting-caret.test.tsx; registry/ouro/lib/ouro/use-resting-caret.ts verify:fileLine(registry/ouro/lib/ouro/use-resting-caret.ts, /const afterIdle = 30_000;/) verify:testExists(registry/ouro/components/ouro/text-field/text-area.resting-caret.test.tsx::TextArea resting caret > rests after thirty seconds, keeps focus and selection, and inserts the first waking character) verify:testExists(registry/ouro/components/ouro/text-field/text-area.resting-caret.test.tsx::TextArea resting caret > wakes for host input and composition, but not reading with the pointer or wheel)
[^safety]: registry/ouro/components/ouro/text-field/text-area.resting-caret.test.tsx verify:testExists(registry/ouro/components/ouro/text-field/text-area.resting-caret.test.tsx::TextArea resting caret > leaves caller readOnly alone and releases a hold when host safety changes) verify:testExists(registry/ouro/components/ouro/text-field/text-area.resting-caret.test.tsx::TextArea resting caret > does not undo a caller's readOnly change made while held)
[^selection]: registry/ouro/components/ouro/text-field/text-field.resting-caret.test.tsx verify:testExists(registry/ouro/components/ouro/text-field/text-field.resting-caret.test.tsx::TextField resting caret > keeps a backward selection and accepts the first character after a host wake)
[^native]: registry/ouro/lib/ouro/use-resting-caret.ts verify:fileLine(registry/ouro/lib/ouro/use-resting-caret.ts, /if \(textBox\(box\) && box\.selectionStart === null\) return;/)
[^visibility]: registry/ouro/lib/ouro/use-resting-caret.ts verify:fileLine(registry/ouro/lib/ouro/use-resting-caret.ts, /if \(visible && foreground\)/)
[^css]: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/caret-animation verify:urlOk(https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/caret-animation)
[^native-animation]: registry/ouro/lib/ouro/use-resting-caret.test.tsx verify:testExists(registry/ouro/lib/ouro/use-resting-caret.test.tsx::resting caret host contract > uses the engine's steady caret when supported and restores the caller's animation)
