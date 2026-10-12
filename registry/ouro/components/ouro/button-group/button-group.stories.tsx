import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode, SVGProps } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ButtonGroup } from "@/registry/ouro/components/ouro/button-group/button-group";
import { Toggle } from "@/registry/ouro/components/ouro/toggle/toggle";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

function ChevronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

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
        display: "grid",
        justifyItems: "start",
        gap: 20,
      }}
    >
      {children}
    </div>
  );
}

const meta = {
  title: "Actions/ButtonGroup",
  component: ButtonGroup,
  parameters: { layout: "padded" },
  args: { label: "Pagination", children: null },
  argTypes: { fullWidth: { control: "boolean" } },
} satisfies Meta<typeof ButtonGroup>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  render: (args) => (
    <ButtonGroup {...args}>
      <Button variant="outline" tone="secondary">
        Previous
      </Button>
      <Button variant="outline" tone="secondary">
        Next
      </Button>
    </ButtonGroup>
  ),
};

/** Outline buttons share borders; solid ones get separators; a split button; toggles; full width. */
export const Looks: Story = {
  parameters: { screenshot: { name: "button-group-looks" } },
  render: () => (
    <Surface>
      <ButtonGroup label="Pagination">
        <Button variant="outline" tone="secondary">
          Previous
        </Button>
        <Button variant="outline" tone="secondary">
          1
        </Button>
        <Button variant="outline" tone="secondary">
          2
        </Button>
        <Button variant="outline" tone="secondary">
          Next
        </Button>
      </ButtonGroup>
      <ButtonGroup label="Save">
        <Button>Save recipe</Button>
        <Button aria-label="More save options">
          <ChevronIcon style={{ width: "1.25em", height: "1.25em" }} />
        </Button>
      </ButtonGroup>
      <ButtonGroup label="Servings">
        <Button variant="soft" tone="secondary">
          −
        </Button>
        <Button variant="soft" tone="secondary">
          +
        </Button>
      </ButtonGroup>
      <ButtonGroup label="Formatting">
        <Toggle label="Bold" variant="outline" />
        <Toggle label="Italic" variant="outline" defaultPressed />
      </ButtonGroup>
      <ButtonGroup label="Answer" fullWidth>
        <Button variant="outline" tone="secondary">
          Yes
        </Button>
        <Button variant="outline" tone="secondary">
          No
        </Button>
      </ButtonGroup>
    </Surface>
  ),
};
