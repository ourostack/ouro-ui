import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode, type SVGProps } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";
import type { TextAreaHighlight } from "@/registry/ouro/components/ouro/text-field/text-area";
import { Toggle } from "@/registry/ouro/components/ouro/toggle/toggle";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel, the width of a chat pane. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) + 4px)",
        padding: 16,
        display: "grid",
        gap: 16,
        maxWidth: 640,
      }}
    >
      {children}
    </div>
  );
}

/** The messages sent so far, so a story shows what Send did. */
function Sent({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <ol aria-label="Sent" style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8, justifyItems: "end" }}>
      {messages.map((message, index) => (
        <li key={index} style={{ background: "var(--muted)", borderRadius: "calc(var(--radius) + 4px)", padding: "6px 12px", whiteSpace: "pre-wrap", maxWidth: "80%" }}>
          {message}
        </li>
      ))}
    </ol>
  );
}

const icon = (path: ReactNode) =>
  function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20" {...props}>
        {path}
      </svg>
    );
  };
const FormatIcon = icon(<path d="M3 15.5 7.5 4.5h1L13 15.5M4.6 11.5h6.8M14 15.5c0-2 .8-3 2.5-3s1.5 1 1.5 3" />);
const EmojiIcon = icon(
  <>
    <circle cx="10" cy="10" r="7" />
    <path d="M7 11.8c.7 1 1.7 1.5 3 1.5s2.3-.5 3-1.5" />
    <path d="M7.5 8h.01M12.5 8h.01" strokeWidth="2" />
  </>,
);
const AttachIcon = icon(<path d="m15.5 9.5-5.6 5.6a3.5 3.5 0 0 1-5-5l6-6a2.3 2.3 0 0 1 3.3 3.3l-6 6a1.2 1.2 0 0 1-1.7-1.7l5.5-5.5" />);
const BoldIcon = icon(<path d="M6 4h5a3 3 0 0 1 0 6H6zM6 10h6a3 3 0 0 1 0 6H6z" />);
const ItalicIcon = icon(<path d="M12 4H8.5M11.5 16H8M11 4 9 16" />);
const ListIcon = icon(<path d="M8 6h8M8 10h8M8 14h8M4.5 6h.01M4.5 10h.01M4.5 14h.01" strokeWidth="1.75" />);

const meta = {
  title: "Chat/Composer",
  component: Composer,
  parameters: { layout: "padded" },
  args: { label: "Message Mia", placeholder: "Write a message", onSend: () => {} },
  argTypes: {
    sendOn: { control: "inline-radio", options: ["enter", "mod-enter"] },
    sending: { control: "boolean" },
    disabled: { control: "boolean" },
    sendDisabledReason: { control: "text" },
    description: { control: "text" },
  },
} satisfies Meta<typeof Composer>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  render: (args) => (
    <Surface>
      <Composer {...args} />
    </Surface>
  ),
};

function Chat() {
  const [messages, setMessages] = useState<string[]>([]);
  return (
    <Surface>
      <Sent messages={messages} />
      <Composer label="Message Mia" placeholder="Write a message" onSend={(text) => setMessages([...messages, text])} />
    </Surface>
  );
}

/** One line that grows as you write. Enter sends and Shift+Enter starts a new line; after a send the box clears. */
export const Basic: Story = {
  render: () => <Chat />,
};

const draft = "Thanks for the notes. I can bring the sourdough starter on Saturday morning.";
const suggested: TextAreaHighlight[] = [{ start: 0, end: 21, label: "Suggested by your assistant", id: "thanks" }, { start: 34, end: 55, label: "Suggested by your assistant", id: "starter" }];

function Suggestions() {
  const [text, setText] = useState(draft);
  const [highlights, setHighlights] = useState(suggested);
  const [messages, setMessages] = useState<string[]>([]);
  return (
    <Surface>
      <Sent messages={messages} />
      <Composer
        label="Reply to Mia"
        value={text}
        onValueChange={setText}
        highlights={highlights}
        onHighlightsChange={setHighlights}
        description="Your assistant's suggestions are underlined. Edit them like any other words."
        onSend={(sent) => {
          setMessages([...messages, sent]);
          setText("");
          setHighlights([]);
        }}
      />
    </Surface>
  );
}

/**
 * Words an assistant suggested, marked in the person's draft. The marks follow their words
 * as the person edits; what the person types is never marked, and screen readers hear the
 * marks in the box's description.
 */
export const Suggested: Story = {
  render: () => <Suggestions />,
};

function Tools() {
  const [formatting, setFormatting] = useState(true);
  const [files, setFiles] = useState(["proofing-times.pdf", "crumb.jpg"]);
  return (
    <Surface>
      <Composer
        label="New post in Bakers"
        placeholder="Start a post"
        onSend={() => setFiles([])}
        toolbar={
          formatting && (
            <>
              <Toggle label="Bold" icon={BoldIcon} hideLabel size="sm" />
              <Toggle label="Italic" icon={ItalicIcon} hideLabel size="sm" />
              <Toggle label="Bulleted list" icon={ListIcon} hideLabel size="sm" />
            </>
          )
        }
        actions={
          <>
            <Toggle label="Formatting" icon={FormatIcon} hideLabel pressed={formatting} onPressedChange={setFormatting} />
            <Button variant="plain" tone="secondary" aria-label="Emoji" className="px-2">
              <EmojiIcon aria-hidden="true" />
            </Button>
            <Button variant="plain" tone="secondary" aria-label="Attach a file" className="px-2" onClick={() => setFiles([...files, `notes-${files.length + 1}.txt`])}>
              <AttachIcon aria-hidden="true" />
            </Button>
          </>
        }
        attachments={files.map((file) => (
          <Attachment key={file} name={file} contentType={file.endsWith(".jpg") ? "image/jpeg" : undefined} onRemove={() => setFiles(files.filter((other) => other !== file))} />
        ))}
      />
    </Surface>
  );
}

/**
 * The rest of a composer in the same frame: actions before Send, a formatting bar above the
 * text while Formatting is on, and the files waiting to go under it.
 */
export const WithTools: Story = {
  render: () => <Tools />,
};

/** Sending is off and says why; the person can still write. Enter says the reason again. */
export const SendingOff: Story = {
  render: () => (
    <Surface>
      <Composer label="Reply to Mia" defaultValue="See you Saturday" sendDisabledReason="Sending is off while you review your assistant's draft." onSend={() => {}} />
    </Surface>
  ),
};

/** On its way: the send button shows a spinner, and nothing more sends until it is done. */
export const Sending: Story = {
  render: () => (
    <Surface>
      <Composer label="Reply to Mia" defaultValue="See you Saturday" sending onSend={() => {}} />
    </Surface>
  ),
};

/** For long messages: Enter starts a new line and Ctrl+Enter (Command+Enter on a Mac) sends. */
export const ModEnter: Story = {
  render: () => (
    <Surface>
      <Composer label="Write an update" sendOn="mod-enter" rows={3} placeholder="Write an update" description="Ctrl+Enter to send" onSend={() => {}} />
    </Surface>
  ),
};

/** Disabled: neither the box nor Send takes input. */
export const Disabled: Story = {
  render: () => (
    <Surface>
      <Composer label="Message Mia" placeholder="You left this chat" disabled onSend={() => {}} />
    </Surface>
  ),
};
