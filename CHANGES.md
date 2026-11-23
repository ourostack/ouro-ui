# Changes in this release

- Fix: ConversationList now puts an activity row's time after the context line's words, instead of between the title and them.
- Fixed: the census leaves out a control inside an aria-hidden or inert subtree, so a dialog state no longer carries a copy of the page behind it as unnamed controls.
- Fix: Collapsible's bordered-container story drops its own edge under forced colours, so the trigger's edge no longer doubles.
- Fix: the chat demo's list pane no longer draws its own divider under forced colours, so it does not double ConversationList's own frame edge.
- Fix: Navbar no longer flips between its links and the menu button at widths where they only barely overflow; the measurement that decides whether they fit now accounts for the menu button's own negative margin correctly and keeps a small hysteresis margin before unfolding.
- Fix: SegmentedControl's pressed segment opts out of forced-colours adjustment, so its label draws in HighlightText instead of the same colour as the thumb behind it.
