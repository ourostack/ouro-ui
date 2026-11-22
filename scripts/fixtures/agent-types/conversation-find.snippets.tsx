// What agents write with conversation-find: snippets whose cases are in conversation-find.cases.ts.
import { ConversationFind } from "@/registry/ouro/components/ouro/conversation-find/conversation-find";

const noop = () => {};

export const conversationFind01 = <ConversationFind label="Find" value="lunch" query="lunch" onQueryChange={noop} count={3} current={0} onCurrentChange={noop} onClose={noop} />;
export const conversationFind02 = <ConversationFind label="Find" query="lunch" onQueryChange={noop} count={3} current={0} onCurrentChange={noop} onNext={noop} onClose={noop} />;
export const conversationFindOk01 = <ConversationFind label="Find in conversation" query="lunch" onQueryChange={noop} count={3} current={0} onCurrentChange={noop} onClose={noop} />;
