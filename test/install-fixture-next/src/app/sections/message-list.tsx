import { Message } from "@/components/ouro/message/message";
import { MessageList } from "@/components/ouro/message/message-list";

// The named region and its messages are in the server HTML, with the live region empty.
// expect: role="region" aria-label="Ouro conversation"
// expect: Ouro list question
// expect: Ouro list answer
// expect: aria-live="polite"
export default function MessageListSection() {
  return (
    <MessageList label="Ouro conversation" className="h-64">
      <Message role="user" name="Ada">
        Ouro list question
      </Message>
      <Message role="assistant" name="Ouro">
        Ouro list answer
      </Message>
    </MessageList>
  );
}
