// What agents write with conversation-list: snippets whose cases are in conversation-list.cases.ts.
import { ConversationList } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";

export const conversationList01 = <ConversationList label="Conversations" items={[]} onSelect={() => {}} value="ada" />;
export const conversationList02 = <ConversationList label="Conversations" items={[]} onSelect={() => {}} density="cozy" />;
export const conversationListOk01 = <ConversationList label="Conversations" items={[{ id: "ada", title: "Ada Lovelace", preview: "Hi", time: "9:41", unread: true }]} selectedId="ada" onSelect={() => {}} density="compact" unreadLabel="Unread" empty="Nothing here yet" className="w-80" />;
