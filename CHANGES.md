# Changes in this release

- Fixed: a named MessageList keeps the reader's place when every message gets a new key at once, [as its measured heights carry over by position](registry/ouro/components/ouro/message/message-list.test.tsx "verify:testExists(registry/ouro/components/ouro/message/message-list.switching.test.tsx::MessageList switching conversations > holds the reader's place through a full re-key of a named conversation, with its rows not yet measured, in messages of varied heights)"); without `conversation`, such a re-key is still taken for a switch to the newest message.
