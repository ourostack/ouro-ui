// What agents write with conversation-list: snippets whose cases are in conversation-list.cases.ts.
import { Avatar, AvatarGroup } from "@/registry/ouro/components/ouro/avatar/avatar";
import { ConversationList } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";

export const conversationList01 = <ConversationList label="Conversations" items={[]} onSelect={() => {}} value="ana" />;
export const conversationList02 = <ConversationList label="Conversations" items={[]} onSelect={() => {}} density="cozy" />;
export const conversationList03 = <ConversationList label="Conversations" items={[]} onSelect={() => {}} groups={[{ label: "Pinned", items: [] }]} />;
export const conversationList04 = <ConversationList label="Chats" items={[{ id: "crew", title: "The whole crew", avatar: <AvatarGroup label="Crew" size="sm"><Avatar name="Captain Nemo" /><Avatar name="Ned Land" /></AvatarGroup> }]} onSelect={() => {}} />;
export const conversationListOk01 = <ConversationList label="Conversations" items={[{ id: "ana", title: "Ana Lind", preview: "Hi", time: "9:41", unread: true }]} selectedId="ana" onSelect={() => {}} density="compact" unreadLabel="Unread" empty="Nothing here yet" className="w-80" />;
export const conversationListOk02 = <ConversationList label="Chats" items={[{ id: "design", title: "Design reviews", where: "Lantern Labs", icon: null, mark: "in 10 min", avatar: false, section: "pinned" }]} sections={[{ id: "pinned", title: "Pinned", note: "your folder", defaultOpen: true }]} onSectionOpenChange={() => {}} onSelect={(_id, event) => event.preventDefault()} />;
export const conversationListOk03 = <ConversationList label="Chats" items={[{ id: "crew", title: "The whole crew", members: [{ name: "Captain Nemo", src: "/nemo.webp" }, { name: "Ned Land" }] }]} membersLabel={(names) => `${names.length} aboard`} onSelect={() => {}} />;
export const conversationListOk04 = <ConversationList label="Chats" items={[{ id: "ana", title: "Ana Lind" }]} firstViewHeight={480} onSelect={() => {}} />;
