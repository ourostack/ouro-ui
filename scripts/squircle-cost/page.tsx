import "../../app.css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Card } from "@/registry/ouro/components/ouro/card/card";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { Item } from "@/registry/ouro/components/ouro/item/item";

// The page the squircle cost probe (run.mjs, harness.swift) measures: a chat, typed into while messages arrive
// (`?chat`), and a field of squircle controls whose surroundings repaint every frame (`?bench`). `&off` hides the
// squircle surfaces and their layers, for the same page drawn without them.
const query = new URLSearchParams(location.search);
const names = [
  "Ana Lind",
  "Mia Chen",
  "Ravi Shah",
  "Tom Ode",
  "Lea Park",
  "Sam Roy",
  "Ivy Wu",
  "Jon Bell",
  "Kim Ito",
  "Ola Berg",
  "Pat Kerr",
  "Zed Moss",
];
declare global {
  interface Window {
    probePush?: (on: boolean) => void;
  }
}

function Chat() {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState(() =>
    Array.from({ length: 20 }, (_, i) => i),
  );
  const list = useRef<HTMLElement>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    window.probePush = (on) => {
      clearInterval(timer);
      if (on)
        timer = setInterval(
          () => setMessages((all) => [...all, all.length]),
          400,
        );
    };
  }, []);
  useEffect(
    () => list.current?.scrollTo({ top: list.current.scrollHeight }),
    [messages],
  );
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        height: "100vh",
      }}
    >
      <aside style={{ overflow: "hidden", padding: 8 }}>
        {names.map((name, i) => (
          <Item
            key={name}
            title={name}
            description="Last message"
            media={<Avatar name={name} shape={i % 4 ? "circle" : "square"} />}
            actions={<Badge>{i + 1}</Badge>}
          />
        ))}
      </aside>
      <main style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <header
          style={{ display: "flex", gap: 8, padding: 8, alignItems: "center" }}
        >
          <Avatar name="Design crew" shape="square" />
          <Button>Join</Button>
          <Button variant="outline">Share</Button>
          <Button variant="soft" tone="secondary">
            Files
          </Button>
          <Badge tone="success">Live</Badge>
        </header>
        <section
          ref={list}
          style={{
            flex: 1,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: 8,
          }}
        >
          {messages.map((i) => (
            <Card
              key={i}
              className="shrink-0"
              title={names[i % names.length]}
              description={`Message ${i}, a line of chat that runs on a bit.`}
              action={
                <Button variant="outline" size="sm">
                  Reply
                </Button>
              }
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Avatar name={names[i % names.length]} size="sm" />
                <Badge>Thread</Badge>
              </div>
            </Card>
          ))}
        </section>
        <footer style={{ padding: 8 }}>
          <Composer
            label="Message the crew"
            placeholder="Write a message"
            value={text}
            onValueChange={setText}
            onSend={() => setText("")}
            actions={
              <Button variant="plain" aria-label="Attach">
                +
              </Button>
            }
          />
        </footer>
      </main>
    </div>
  );
}

function Bench() {
  return (
    <div
      id="bench"
      style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 8 }}
    >
      {Array.from({ length: 120 }, (_, i) => (
        <span key={i} style={{ display: "contents" }}>
          <Button variant={i % 2 ? "outline" : "solid"}>Action {i}</Button>
          <Badge>{i}</Badge>
          {i % 4 === 0 && (
            <Card title={`Card ${i}`} description="A card">
              x
            </Card>
          )}
        </span>
      ))}
    </div>
  );
}

if (query.has("off")) {
  const style = document.createElement("style");
  style.textContent =
    "[data-ouro-surface]{display:none!important}[data-ouro-squircle],[data-ouro-avatar-surface]{will-change:auto!important;clip-path:none!important}";
  document.head.append(style);
}
createRoot(document.getElementById("root")!).render(
  query.has("bench") ? <Bench /> : <Chat />,
);
