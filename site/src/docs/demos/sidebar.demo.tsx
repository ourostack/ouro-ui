import { type JSX } from "react";
import { Sidebar } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/sidebar/: the component as an app would use it, with its props, nothing else.

function BookIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H16v12H5.5A1.5 1.5 0 0 0 4 16.5v-12ZM4 16.5A1.5 1.5 0 0 0 5.5 18H16" />
    </svg>
  );
}

function StackIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m10 3 7 4-7 4-7-4 7-4ZM3 11l7 4 7-4" />
    </svg>
  );
}

export default function SidebarDemo(): JSX.Element {
  return (
    <div className="h-96 w-full">
      <Sidebar
        label="Demo"
        header={
          <Text>
            <strong>Spoonjoy</strong>
          </Text>
        }
        sections={[
          {
            items: [
              { label: "Recipes", href: "#recipes", icon: <BookIcon />, current: true },
              { label: "Cookbooks", href: "#cookbooks", icon: <StackIcon /> },
            ],
          },
          {
            label: "Kitchen",
            items: [
              { label: "Shopping list", href: "#shopping-list" },
              { label: "Pantry", href: "#pantry" },
            ],
          },
        ]}
      />
    </div>
  );
}
