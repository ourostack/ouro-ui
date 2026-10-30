import { Message } from "@/components/ouro/message/message";

// The author's name, the message and the avatar's initials are in the server HTML.
// expect: <article[^>]*data-ouro="message"[^>]*data-role="assistant"
// expect: Ouro message author
// expect: Ouro message text
// expect: >OA<
// A post's subject and its footer render on the server, with the action bar.
// expect: data-variant="post"
// expect: Ouro post subject
// expect: Ouro post footer
// expect: role="toolbar"
export default function MessageSection() {
  return (
    <>
      <Message role="assistant" name="Ouro message author">
        Ouro message text
      </Message>
      <Message variant="post" role="assistant" name="Ouro poster" time="7:30 AM" subject="Ouro post subject" footer={<span>Ouro post footer</span>} menu={[{ label: "Copy link", href: "#copy" }]}>
        Ouro post text
      </Message>
    </>
  );
}
