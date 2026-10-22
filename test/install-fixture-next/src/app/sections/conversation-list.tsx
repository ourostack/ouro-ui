import { ConversationList } from "@/components/ouro/conversation-list/conversation-list";

async function openConversation(_id: string) {
  "use server";
}

// expect: data-ouro="conversation-list"
// expect: aria-current="true"
// expect: Ouro trail crew
export default function ConversationListSection() {
  return (
    <ConversationList
      label="Conversations"
      items={[
        { id: "trail", title: "Ouro trail crew", preview: "Meet at eight.", time: "9:41", unread: true },
        { id: "ada", title: "Ada Lovelace" },
      ]}
      selectedId="trail"
      onSelect={openConversation}
    />
  );
}
