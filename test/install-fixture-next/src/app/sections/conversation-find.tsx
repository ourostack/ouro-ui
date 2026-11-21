import { ConversationFind } from "@/components/ouro/conversation-find/conversation-find";

// expect: data-ouro="conversation-find"
// expect: Find in conversation
export default function ConversationFindSection() {
  return <ConversationFind label="Find in conversation" query="" onQueryChange={() => {}} count={0} current={null} onCurrentChange={() => {}} onClose={() => {}} />;
}
