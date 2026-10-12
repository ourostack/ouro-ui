import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";

// The live demo at the top of docs/message-list/: the component as an app would use it, with its props, nothing else.

const replies = ["About an hour, somewhere warm.", "Yes, overnight in the fridge works too.", "Preheat to 230°C with steam.", "When it sounds hollow underneath."];
const questions = ["How long should the dough rest?", "Can it rest in the fridge?", "What temperature?", "How do I know it's done?"];

export default function MessageListDemo(): JSX.Element {
  const [turns, setTurns] = useState(2);
  return (
    <div className="grid gap-3">
      <MessageList label="Conversation with Ouro" className="h-72">
        {Array.from({ length: turns }, (_, turn) => [
          <Message key={`q${turn}`} role="user" name="Ada Lovelace">
            {questions[turn % questions.length]}
          </Message>,
          <Message key={`a${turn}`} role="assistant" name="Ouro">
            {replies[turn % replies.length]}
          </Message>,
        ])}
      </MessageList>
      <Button className="justify-self-end" onClick={() => setTurns(turns + 1)}>
        Ask another question
      </Button>
    </div>
  );
}
