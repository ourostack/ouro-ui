import { Message } from "@/components/ouro/message/message";

// The author's name, the message and the avatar's initials are in the server HTML.
// expect: <article[^>]*data-ouro="message"[^>]*data-role="assistant"
// expect: Ouro message author
// expect: Ouro message text
// expect: >OA<
export default function MessageSection() {
  return (
    <Message role="assistant" name="Ouro message author">
      Ouro message text
    </Message>
  );
}
