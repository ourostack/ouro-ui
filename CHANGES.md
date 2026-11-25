# Changes in this release

- Fix: MessageList gives [each message its Tab stop, control, part, position and size in its own first render, so a row mounted during a scroll gets no second attribute write](registry/ouro/components/ouro/message/message-list.test.tsx "verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > gives a Message its control, part, position and size in its own first render, so none is written again once it mounts)").
- Changed: TimeGrid draws its strip for events that span the day only when it holds an event, so a week without one no longer keeps a blank strip under the day names.
- Fixed: TimeGrid's day header drops its blur under forced colours and draws on the system canvas.
- Changed: TimeGrid's day header is a lighter glass over the hours scrolled beneath it, with a stronger blur, and its text and controls stay readable in light and dark.
- Fixed: a narrow TimeGrid event shows its start time and drops the end, rather than cutting the range mid-word.
- New: TimeGridNav takes `disabled`, which disables Today, Previous and Next while a grid's events load.
- Fixed: in a right-to-left page, TimeGrid draws an event's title and its time on the same side, where the title used to sit at the left.
