import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Sheet } from "@/registry/ouro/components/ouro/sheet/sheet";
import { RedwoodActionSheet } from "@/stories/reference/RedwoodActionSheet";

// Repository-only: RedwoodUI's ActionSheet is a reference for the feel check, not part of
// the `sheet` registry item, so this story lives outside registry/. Same title as the
// Sheet stories, so it stays at Overlays/Sheet/Feel comparison.

const stack: CSSProperties = { display: "grid", gap: 12 };
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" };
const caption: CSSProperties = {
  fontWeight: 500, fontSize: "12px", lineHeight: "16px",
  color: "var(--muted-foreground)",
  letterSpacing: "0.02em",
  textTransform: "uppercase",
};
const body: CSSProperties = { fontWeight: 400, fontSize: "16px", lineHeight: "24px", color: "var(--foreground)", margin: 0 };

const cookbooks = ["Weeknight dinners", "Baking", "Grandma's recipes", "Meal prep", "Holidays"];

/** A list of cookbook rows, the content Spoonjoy's save sheet shows. */
function CookbookList() {
  const [saved, setSaved] = useState<string[]>(["Baking"]);
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {cookbooks.map((name) => {
        const on = saved.includes(name);
        return (
          <Button
            key={name}
            variant={on ? "soft" : "plain"}
            tone={on ? "primary" : "secondary"}
            fullWidth
            aria-pressed={on}
            onClick={() => setSaved(on ? saved.filter((item) => item !== name) : [...saved, name])}
          >
            {on ? `${name} (saved)` : name}
          </Button>
        );
      })}
    </div>
  );
}

const meta = {
  title: "Overlays/Sheet",
  component: Sheet,
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

function Column({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ ...stack, justifyItems: "center" }}>
      <span style={caption}>{label}</span>
      {children}
    </div>
  );
}

/**
 * Ouro UI's Sheet (Base UI Drawer) next to RedwoodUI's ActionSheet (Motion drag),
 * with the same content. Open each on a phone and compare: the stretch when pulled
 * up, the backdrop lightening as it is dragged down, the spring back on release,
 * and dismissal with a flick.
 */
export const FeelComparison: Story = {
  args: { title: "Save to cookbook", children: null, trigger: <Button>Save</Button> },
  name: "Feel comparison",
  parameters: {
    layout: "fullscreen",
    conformance: { clientOnly: "The port of RedwoodUI's ActionSheet (RedwoodActionSheet.tsx) portals with createPortal during its first render, which React cannot render on a server" },
  },
  render: () => (
    <div style={{ ...row, justifyContent: "center", gap: 32, padding: "48px 16px" }}>
      <Column label="Ouro UI">
        <Sheet title="Save to cookbook" trigger={<Button data-feel="ouro">Open Ouro sheet</Button>}>
          <CookbookList />
        </Sheet>
      </Column>
      <Column label="RedwoodUI reference">
        <RedwoodActionSheet
          side="bottom"
          size={340}
          label="Save to cookbook"
          openButton={
            <Button data-feel="redwood" variant="soft">
              Open Redwood sheet
            </Button>
          }
        >
          <div style={{ display: "grid", gap: 8, padding: "20px 20px 0" }}>
            <h2 style={{ ...body, fontWeight: 600, fontSize: "18px", lineHeight: "24px" }}>Save to cookbook</h2>
            <CookbookList />
          </div>
        </RedwoodActionSheet>
      </Column>
    </div>
  ),
};
