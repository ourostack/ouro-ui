import { Porthole } from "@/components/ouro/porthole/porthole";

// expect: data-ouro="porthole"
// expect: data-porthole-state="error"
// expect: Ouro status spot error
export default function PortholeSection() {
  const now = Date.now();
  return (
    <Porthole
      label="Status"
      source={{
        snapshot: {
          version: 1,
          items: [{ id: "offline", priority: "error", label: "Ouro status spot error", since: now }],
          areas: { chats: { lastVerifiedAt: now, troubleSince: null } },
        },
        lastBeatAt: now,
      }}
    />
  );
}
