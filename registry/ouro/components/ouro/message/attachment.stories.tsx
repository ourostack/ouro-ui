import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) + 4px)",
        padding: 24,
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        maxWidth: 560,
      }}
    >
      {children}
    </div>
  );
}

const meta = {
  title: "Chat/Attachment",
  component: Attachment,
  parameters: { layout: "padded" },
  args: { name: "sourdough-schedule.pdf", size: 1_258_291, contentType: "application/pdf", href: "#sourdough" },
} satisfies Meta<typeof Attachment>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  render: (args) => (
    <Surface>
      <Attachment {...args} />
    </Surface>
  ),
};

/** Files on a sent message: links that open them, with an icon for images, and a long name that truncates. */
export const Files: Story = {
  parameters: { screenshot: { name: "attachment-files" } },
  render: () => (
    <Surface>
      <Attachment name="menu.pdf" size={2048} contentType="application/pdf" href="#menu" />
      <Attachment name="crumb.jpg" size={348_160} contentType="image/jpeg" href="#crumb" />
      <Attachment name="a-very-long-recipe-file-name-from-grandmas-notebook.txt" size={512} contentType="text/plain" href="#notes" />
    </Surface>
  ),
};

const waiting = ["menu.pdf", "crumb.jpg", "notes.txt"];

function Composer() {
  const [files, setFiles] = useState(waiting);
  return (
    <Surface>
      {files.map((file) => (
        <Attachment key={file} name={file} contentType={file.endsWith(".jpg") ? "image/jpeg" : undefined} onRemove={() => setFiles(files.filter((other) => other !== file))} />
      ))}
      {/* The composer's own control, where focus goes once the last file is removed. */}
      <Button variant="outline" tone="secondary" onClick={() => setFiles(waiting)}>
        Attach files
      </Button>
    </Surface>
  );
}

/** Files waiting to be sent, each with a remove button named after it. */
export const Removable: Story = {
  render: () => <Composer />,
};

/** An icon for each kind of file, picked from the MIME type or the name's extension: documents, spreadsheets, slides and PDFs in the colors people know them by. */
export const Kinds: Story = {
  render: () => (
    <Surface>
      <Attachment name="trip-notes.docx" size={24_576} href="#notes" />
      <Attachment name="budget.xlsx" size={18_432} href="#budget" />
      <Attachment name="pitch.pptx" size={4_404_019} href="#pitch" />
      <Attachment name="menu.pdf" size={2048} contentType="application/pdf" href="#menu" />
      <Attachment name="crumb.jpg" size={348_160} contentType="image/jpeg" href="#crumb" />
      <Attachment name="first-rise.mov" size={52_428_800} contentType="video/quicktime" href="#rise" />
      <Attachment name="voice-note.m4a" size={409_600} href="#voice" />
      <Attachment name="recipes.zip" size={9_437_184} href="#recipes" />
      <Attachment name="timer.ts" size={1200} href="#timer" />
      <Attachment name="starter" size={512} href="#starter" />
    </Surface>
  ),
};

function InApp() {
  const [opened, setOpened] = useState<string | null>(null);
  return (
    <Surface>
      <Attachment name="crumb.jpg" size={348_160} contentType="image/jpeg" onOpen={() => setOpened("crumb.jpg")} />
      <Attachment name="menu.pdf" size={2048} contentType="application/pdf" href="#menu" onOpen={() => setOpened("menu.pdf")} />
      <p role="status" style={{ flexBasis: "100%", margin: 0, color: "var(--muted-foreground)" }}>
        {opened ? `Opened ${opened} in the app` : "Nothing open"}
      </p>
    </Surface>
  );
}

/** `onOpen` opens a file in the app, such as in a Lightbox: a button without `href`, and with it a link whose plain click stays in the app. */
export const OpensInApp: Story = {
  render: () => <InApp />,
};
