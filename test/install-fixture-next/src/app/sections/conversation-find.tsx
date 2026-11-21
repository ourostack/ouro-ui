import { ConversationFind } from "@/components/ouro/conversation-find/conversation-find";

async function noop() {
  "use server";
}

// expect: data-ouro="conversation-find"
// expect: Find in conversation
export default function ConversationFindSection() {
  return <ConversationFind label="Find in conversation" query="" onQueryChange={noop} count={0} current={null} onCurrentChange={noop} onClose={noop} />;
}
