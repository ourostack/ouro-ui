# Changes in this release

- Fixed: the rich Composer keeps focus when Escape is pressed and nothing is open, where Lexical used to blur the box and drop a keyboard person's place.
- Fixed: [closing a thread gives focus back to the control that opened it without scrolling the page to that control](registry/ouro/components/ouro/thread-layout/thread-layout.test.tsx "verify:testExists(registry/ouro/components/ouro/thread-layout/thread-layout.test.tsx::ThreadLayout > gives focus back to the conversation's control that opened the thread without scrolling the page to it)"), so a reader who sent a message while the thread was open stays where they scrolled, with Jump to latest still hidden.
