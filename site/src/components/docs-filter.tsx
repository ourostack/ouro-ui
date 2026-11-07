import type { JSX } from "react";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { claim } from "@/registry/ouro/lib/ouro/claims";

/** The filter above the docs' links, in the sidebar and in the header's menu. It narrows the components as you type. */
export function DocsFilter({ value, onChange, empty }: { value: string; onChange: (value: string) => void; empty: boolean }): JSX.Element {
  return (
    <div className="grid w-full gap-1 py-1">
      <TextField
        label="Filter components"
        hideLabel
        type="search"
        clearable
        placeholder="Filter components"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {empty && (
        <p role="status" className="m-0 text-sm text-muted-foreground">
          {claim("No component is called that.", {
            source: { file: "site/src/components/docs-filter.tsx" },
            verify: { testExists: "site/src/site.test.tsx::docs > narrows the sidebar to the components a filter names, and says when none is called that" },
          })}
        </p>
      )}
    </div>
  );
}
