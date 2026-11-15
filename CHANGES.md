# Changes in this release

- Changed: a Message [mounts in one commit](registry/ouro/components/ouro/message/message.test.tsx "verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message > mounts in one commit, without drawing itself again once its element is there, in a list's layer too)"): it keeps its element in a ref, so a list of messages no longer draws them all a second time as it opens.
