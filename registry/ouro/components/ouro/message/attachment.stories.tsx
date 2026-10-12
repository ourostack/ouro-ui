import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
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

function Composer() {
  const [files, setFiles] = useState(["menu.pdf", "crumb.jpg", "notes.txt"]);
  return (
    <Surface>
      {files.map((file) => (
        <Attachment key={file} name={file} contentType={file.endsWith(".jpg") ? "image/jpeg" : undefined} onRemove={() => setFiles(files.filter((other) => other !== file))} />
      ))}
    </Surface>
  );
}

/** Files waiting to be sent, each with a remove button named after it. */
export const Removable: Story = {
  render: () => <Composer />,
};
