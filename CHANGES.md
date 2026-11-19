# Changes in this release

- New: a release attaches its registry.json with a signed attestation, so the file an install reads can be traced to the workflow and commit that built it.
- New: ChatHeader takes `level={4}`, for a chat inside a section that has its own heading.
- New: [ReadReceipt, who has seen a message as small faces in its footer: the first three readers, then "+N"](registry/ouro/components/ouro/read-receipt/read-receipt.test.tsx "verify:testExists(registry/ouro/components/ouro/read-receipt/read-receipt.test.tsx::ReadReceipt > shows the first three readers as small faces, and counts the rest)"), and "Seen by Ana Lind and 2 others" for screen readers.
