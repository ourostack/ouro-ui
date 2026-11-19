import type { JSX, Ref } from "react";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { AskFor } from "./ask-for";

/**
 * The filter above the docs' links, in the sidebar. It narrows the components as you type, and `hint` says which
 * component another kit's name found ("Looking for a modal? Here it's Dialog."). `/` puts focus in it (the sidebar
 * listens), which its empty box shows with a mouse, and Enter calls `onEnter` to open the best match.
 */
export function DocsFilter({
  value,
  onChange,
  empty,
  hint,
  onEnter,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  empty: boolean;
  hint?: string | undefined;
  onEnter?: (() => void) | undefined;
  inputRef?: Ref<HTMLInputElement> | undefined;
}): JSX.Element {
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
        ref={inputRef}
        aria-keyshortcuts="/"
        onKeyDown={(event) => {
          // Not the Enter that ends a composed word (Safari sends it as keyCode 229, without isComposing).
          if (event.key !== "Enter" || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || !onEnter) return;
          event.preventDefault();
          onEnter();
        }}
        // The key that brings you here, for a mouse; a touch screen has no "/" to press.
        endAdornment={
          value === "" ? (
            <span aria-hidden="true" className="hidden pointer-fine:inline-flex">
              <Kbd keys={["/"]} />
            </span>
          ) : undefined
        }
      />
      {(empty || hint !== undefined) && (
        <p role="status" className="m-0 text-sm text-muted-foreground">
          {empty ? (
            <>
              {claim("No component is called that.", {
                source: { file: "site/src/components/docs-filter.tsx" },
                verify: { testExists: "site/src/site.test.tsx::docs > narrows the sidebar to the components a filter names, and says when none is called that" },
              })}
              <AskFor query={value} />
            </>
          ) : (
            hint
          )}
        </p>
      )}
    </div>
  );
}
