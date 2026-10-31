// What agents write with message-list: snippets whose cases are in message-list.cases.ts.
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";

export const messageList01 = <MessageList label="Conversation" autoScroll><Message role="user" name="Ada">Hi</Message></MessageList>;
export const messageList02 = <MessageList><Message role="user" name="Ada">Hi</Message></MessageList>;
export const messageListOk01 = <MessageList label="Conversation" jumpLabel="Jump to latest" newMessageLabel={(author, text) => `${author}: ${text}`}><Message role="user" name="Ada">Hi</Message></MessageList>;
export const messageListOk02 = <MessageList label="Team chat" onMessageKeyDown={(message, event) => { if (event.key === "1") message.dataset.reacted = "true"; }}><Message role="user" name="Ada" id="m1">Hi</Message></MessageList>;
