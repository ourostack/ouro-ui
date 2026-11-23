# Design craft

How to judge whether a screen is good, not just unbroken, and the beauty gate a screen, mock or capture passes before a person sees it. [Ouro check](guardrails.md#the-screen-check) finds what measurement can decide and is the floor; this guide covers what is left: whether the screen is beautiful, clear and right for the platform it runs on.

## The bar

Ask whether the people who made the Mac and the iPhone would ship it: Jony Ive for craft and restraint, Tony Fadell for the whole journey, Craig Federighi for software that behaves as a person expects. If they wouldn't, it isn't ready. "Not ugly" is not the bar, and neither is "better than what we had".

## Judge a screen

Work through these in order. Ask each as a question of the screen in front of you, then make the fix.

1. **Find the one thing.** Name the screen's main job in a sentence. Make what serves it the largest, clearest thing on the screen, and let everything else step back in size, weight and colour.
2. **Make every element earn its place.** For each element, ask what breaks if it goes. If nothing does, delete it. Prefer taking away to adding: a second border, a label that repeats a heading, an icon beside words that already say it, a card around something that needs no card.
3. **Put each thing where it belongs, once.** A control reads as acting on the region it sits in. Put app-wide navigation in the window's toolbar or sidebar, a pane's own actions in that pane's header, and an item's actions on the item. Keep always-on chrome, such as the window's toolbar, to controls that apply everywhere; an action for one place lives in that place's own surface. Give each action one control on a screen, not two.
4. **Keep the rhythm.** Choose each padding and margin on purpose, from the theme's spacing steps, and repeat the same gap for the same relationship. Ouro check's `off-scale` rule reports spacing an app wrote off the steps.[^off-scale] Align edges that should line up. Nest corners: an inner radius is the outer radius less the inset, as Apple asks for in [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass). Draw every rounded surface as a squircle in each engine the app ships in; where the engine has no `corner-shape`, as in a WebKit web view, register Ouro's squircle polyfill (`registerSquirclePolyfill`) rather than accept plain round corners.
5. **Separate with space before lines.** Group with space first, a hairline only when space isn't enough, and a frame last. Draw one line between two things, never two. If there is no line, make surfaces read as different by tone, material or elevation: don't cut content off at an edge nothing hinted at, and don't let a header read as a header only by its border.
6. **Hold weight back.** Use few text sizes and weights, the lightest shadow that lifts a surface off what is under it, and colour for meaning rather than decoration. Draw no gradients in the interface, scroll-edge fade masks included: content that scrolls under chrome goes under glass with blur, as in Messages. Pictures and art keep theirs.
7. **Put materials in their layer.** Keep glass and translucency to the controls and navigation that float above the content, never the content itself, and never glass on glass, as Apple's [Materials](https://developer.apple.com/design/human-interface-guidelines/materials) guidance asks. Give content solid surfaces. Under reduced transparency or increased contrast, draw a solid surface with a defined edge.
8. **Use the platform's own interface where it is better.** On a Mac, use the system toolbar, sidebar, window controls and Liquid Glass rather than drawing look-alikes, and let the system draw the bars' backgrounds ([Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)). On Windows, use its title bar, materials and controls. On the web, draw what the platform a person is on would draw. Plan one design with native parts: build the web part to its native counterpart's size, corners and spacing, so putting the native part in later changes nothing a person sees.
9. **Design the whole of what you show, or leave a part out.** A pane that looks like a debug panel (key and value pairs, raw ids, default borders) is not ready to show. Design it to the standard of the main view, or leave it out of what you show.
10. **Centre text on what the eye reads.** In any container (a button, a pill, a badge, a field and its placeholder, a row), centre one line of text on its cap height, not its line box, and give the items in a row one shared midline. `text-box: trim-both cap alphabetic` trims a line box to its cap height.
11. **Keep details whole and current.** A cut-out for a presence dot has its dot. Draw a count badge as layout over its icon, never inside the icon's picture: a small pill with its numeral centred on its cap height, a ring in the exact colour of the surface beneath, kept whole inside its container (and inside a selected pill), at the same offset from its icon as the app's other badges. Give a sender's consecutive messages a small gap and slightly less rounded corners where the bubbles meet; give a lone message four equal corners, and no bubble a single sharp tail corner. A mock of a new screen uses the current message, list and control styles, not old ones. Show only labels, counts, times and shortcuts the product itself would show.
12. **Let a layout place components, never restyle them.** A shell or a screen moves and spaces components: their placement, size, gutters and the surfaces behind them. Leave a component's shape, colour, border and focus to the component; to change its look, change the component for everyone, not one screen's copy.
13. **Reuse a component rather than build a second one.** Before you draw a composer, an avatar, a dialog, a row or a pill, use the one Ouro HX or your app already has, and when it doesn't fit, make it more flexible (a prop, a slot, a variant) for everyone rather than copying it, because two implementations of one thing drift apart. Follow Ari Mendelow's rule: "generally, when we can resuse a component, we MUST", and "always opt for making a component more flexible over making a duplicate component". Ouro's [census](guardrails.md#the-census) counts the controls an app draws that are not Ouro's.
14. **Choose a dialog or a sheet by what it holds.** Put a read-only explanation or a short decision in a centred dialog. Keep a sheet for a task a person does beside the content. Keep square the corners where a sheet docked to the window's full height meets the window's top and bottom; round its corners only where it floats free of the window's edges.
15. **Move with purpose.** Use motion to show where something came from or went, keep it brief, and leave it out when it only decorates ([Motion](https://developer.apple.com/design/human-interface-guidelines/motion)).

## Failures to catch

These came from a review of a chat app's shell mocks that the person rejected. Treat them as a sample of what the bar catches, not a complete list.

| Failure | What it looks like | Do instead |
| --- | --- | --- |
| An unasked redesign | A request to fix the composer comes back with a new sidebar, new navigation and new colours. | Change only what was asked. Put any other idea in a separate proposal with its own before and after. |
| An undesigned pane | A side pane of key and value rows, monospace ids and default borders beside a finished main view. | Design it to the main view's standard, or leave it out. |
| Navigation in the wrong place | App-wide tabs drawn inside one pane, so they read as switching only that pane. | Put app navigation in the window's toolbar or sidebar. |
| A bloated composer | A message field several lines tall at rest, with deep padding and a heavy shadow. | Make it one line tall at rest, growing with the text, with padding that matches the list beside it and a hairline or the lightest shadow. |
| Stale or broken details | A presence cut-out without its dot; last month's message bubbles in this month's mock. | Check every detail against the current components before you show it. |
| Search squeezed into a corner | A small search field in a corner of the toolbar, for a search that covers the whole app. | Give the app one search, opened from the toolbar or with ⌘K, as a command over the window with the window dimmed behind it ([`Command`](../Command.md)). |
| A restyled component | A shell turns people's avatars into circles to follow a convention, overriding the component's own shape and presence cut-out. | Let the layout place it; change the component itself if the look should change. |
| A count baked into an icon | A notification count drawn into a toolbar icon's picture, clipped by the icon's box and off its middle. | Lay the count over the icon as a badge. |
| Text sitting low | A composer's placeholder a few pixels under its field's middle, because the field aligns its row to the bottom. | Centre it on its cap height. |
| A cheap fade | A gradient band or a mask that fades content out under a bar. | Put the bar's glass over the content, or nothing. |
| Hand-drawn where native is better | A drawn title bar and fake glass on a Mac. | Use the system's toolbar, sidebar and materials. |
| A screen stitched from parts | A shell stitched from one product's rail, another's tabs and a third's composer. | Steal, don't copy: see below. |
| A mock shown before it is beautiful | A capture sent as soon as it renders. | Pass the beauty gate first. |

## Iterate live with the person

When you work on a screen with someone, let them watch it change rather than sending them pictures:

- Run the app itself on made-up data, with hot reload, and give each state an address (a place, a theme, the chrome), so the person opens it where they already look and each save reaches their eyes in about a second.
- Don't drive the person's view. Run your own checks against a second dev server and browser, headless, and open no window on their screen.
- Turn each note into one small edit, run the checks, and reply in one line. Don't batch notes into a rewrite.
- Make every decision the person makes a check that runs on every edit, so nothing they approved comes back. List the states in `ouro-check.json`'s `states` so Ouro check reaches them.
- Run critics in the background for taste only, and never let them hold up an edit.
- Cover a state nobody has designed yet with a plain "not designed yet" veil, so the person doesn't judge it.

## Steal, don't copy

Desk's [evidence discipline](https://github.com/ourostack/desk/blob/main/plugins/desk/skills/evidence-discipline/SKILL.md) holds the general rule: work out why prior art works for the people who use it, and make that reason yours. For a screen:

- Write one line per reference: what it does that works, and why it works for its people ("faces only on the chats that are live, so the list is calm").
- Take the reason, not the pixels. Rebuild it from Ouro's components and the platform's own controls, in your product's layout.
- Don't assemble a screen from parts of several references. Make a screen one idea: if references pull different ways, choose one.
- Name what you took from each reference, and why, where the person reviews the work.

## The beauty gate

Pass every step before a person sees a screen, a mock or a capture of either. Use made-up data throughout.

1. **Floor.** Run [Ouro check](guardrails.md#the-screen-check) on the screen and its states, and fix every failing finding. Don't ask a critic or yourself to check by eye what a measurement can decide: make it a check, and keep eyes for taste.
2. **Capture as the person will see it.** Make captures at the window size they use, at double density, in light and in dark, and in each state that matters: empty, busy, open and part-way through a task. Look at the small details, such as badges, presence dots and icons, at 200% zoom.
3. **Put it beside its references.** Put the captures beside the references the person gave or praised, at the same size, and beside the version they saw last, if there is one.
4. **Look yourself first.** Open each capture at full size, check that you changed only what was asked, and fix what they would catch, as Desk's [look before you show it](https://github.com/ourostack/desk/blob/main/plugins/desk/skills/evidence-discipline/SKILL.md) asks.
5. **Ask independent critics.** Start a fresh agent for each lens below, none of which made the work. Give each only the captures, the references, the person's request in their own words, and this guide. Don't give them your reasoning.
6. **Fix, then ask fresh critics.** Fix what they found, capture again, and start new critics rather than asking the same ones, which anchor on their first read. Stop when the critics all approve with nothing left at "blocks" or "should fix": that is a pass.
7. **Show it with its proof.** Show the captures beside the references, a line per reference on what you took, and the critics' verdicts.

If the gate hasn't passed after three rounds, stop polishing: the idea is wrong. Go back to the references and the request, and start the design again.

| Lens | Asks |
| --- | --- |
| Ive: craft | Is every space, type size, icon, colour and motion as beautiful as it can be? Does anything not need to be there? Are alignment, rhythm and hierarchy exact? |
| Fadell: the journey | Where would a person hesitate, wait, or need to know something they shouldn't? What happens when things go wrong? What would send them back to what they used before? |
| Federighi: the platform | Does it look and behave as this platform does: its toolbar, sidebar, materials, search, shortcuts, focus and windows? Is it consistent with itself? |
| Clippy: getting out of the way | Does anything interrupt, cover what the person is using, repeat, talk down, or fail to get out of the way? |

Give each critic this brief, with the angle brackets filled in:

> You are the `<lens>` critic. The bar, in the person's words: "`<their words>`". The request: "`<their request>`". Judge the captures at `<paths>` against the references at `<paths>`, using https://ui.ouroboros.bot/docs/design-craft/. You didn't make this and owe it nothing. Don't fix anything.
>
> 1. Say **approve** or **not yet**.
> 2. Say, reference by reference, where ours is worse, and what the reference does whose reason ours should take.
> 3. List every element that doesn't earn its place, and every detail that is stale, broken or undesigned.
> 4. List each finding with the capture, a crop with the spot ringed, what's wrong, the fix (the component or file), and its weight: blocks, should fix, or nit.
>
> End with one paragraph: "would approve", or "would not approve, because…" with the blockers.

## Prior art

| Find | Verdict | Why |
| --- | --- | --- |
| [Apple's Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/): Materials, Toolbars, Sidebars, Searching, Layout, Motion | Adopt | The platform rules behind rhythm, materials, native-first and motion. |
| [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass) | Adopt | Let the system draw bars and controls; concentric corners; no glass on glass. |
| [Refactoring UI](https://www.refactoringui.com/) (Wathan and Schoger) | Borrow | Hierarchy, spacing and fewer borders; its measurable rules are already Ouro check's [design rules](guardrails.md#design-rules). |
| [How to conduct a heuristic evaluation](https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/) (Nielsen Norman Group) | Borrow | Independent evaluators who judge alone before their results are combined: the shape of the critics in the gate. |
| Desk's [evidence discipline](https://github.com/ourostack/desk/blob/main/plugins/desk/skills/evidence-discipline/SKILL.md) | Adopt | Steal, don't copy, and look at what you show before you show it, linked rather than repeated here. |
| [Raycast](https://www.raycast.com/) and Spotlight | Borrow | One search for the whole app, summoned over the window, rather than a field per view. |
| [Dieter Rams' principles for good design](https://www.vitsoe.com/us/about/good-design) | Borrow | "As little design as possible", the root of making elements earn their place. |

[^off-scale]: registry/ouro/check/token-check.ts verify:fileLine(registry/ouro/check/token-check.ts, /rule: "off-theme" \| "off-scale"/)
