# Agent quickstart

A new Vite and React app with Ouro UI, step by step with the files whole: a settings page with a form the browser validates, a select, a switch, a dark mode toggle that sets the scheme before the first paint, and a confirmation before a destructive action. Run the steps in order and copy the files as they are; a test installs what step 3 adds and type-checks these files against it.[^quickstart] Then change the page to what you are building. For a Next.js app, see [Installing](installing.md#nextjs).

## 1. Create the app

```sh
npm create vite@latest my-app -- --template react-ts
cd my-app
npm install -D tailwindcss @tailwindcss/vite @types/node
```

To build in the current folder, write `.` for `my-app` and leave out `cd my-app`.

## 2. Write the setup files

Replace these four files whole.

`src/index.css`:

```css
@import "tailwindcss";
```

`vite.config.ts`, with Tailwind's plugin, the `@` alias, and the script that sets light or dark before the first paint (`.ts` on its import: `tsconfig.node.json` resolves imports as Node does):

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { colorSchemeScript } from "./src/lib/ouro/color-scheme-script.ts";

const colorScheme = {
  name: "color-scheme",
  transformIndexHtml: () => [{ tag: "script", children: colorSchemeScript(), injectTo: "head-prepend" as const }],
};

export default defineConfig({
  plugins: [react(), tailwindcss(), colorScheme],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
```

`tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }],
  "compilerOptions": { "paths": { "@/*": ["./src/*"] } }
}
```

`tsconfig.app.json`, the template's with the alias:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "types": ["vite/client"],
    "allowArbitraryExtensions": true,
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

## 3. Install Ouro UI

This sets up shadcn/ui, registers the `@ouro` namespace, which serves the newest release,[^namespace] then adds the Ouro theme, and the base tokens, once, with the components the page uses:

```sh
npx shadcn@latest init --base base --preset nova --yes --no-monorepo
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('components.json','utf8'));c.registries={'@ouro':'https://ui.ouroboros.bot/r/{name}.json'};fs.writeFileSync('components.json',JSON.stringify(c,null,2))"
npx shadcn@latest add @ouro/ouro-theme --yes
npx shadcn@latest add @ouro/ouro-base @ouro/page-header @ouro/stack @ouro/form @ouro/text-field @ouro/select @ouro/switch @ouro/button @ouro/confirm-dialog @ouro/color-scheme-toggle @ouro/ouro-check --yes
npm pkg set "imports.#ouro-ax/*=./src/lib/ouro/ax/*"
```

Use these `@ouro` commands: the GitHub addresses install the same release but fetch each file from GitHub, which is much slower. Add other components the same way, `@ouro/<item>`; [llms.txt](https://ui.ouroboros.bot/llms.txt) lists them all.

## 4. Write the app

`src/main.tsx` wraps the app in `ColorSchemeProvider`, which applies the scheme the toggle picks and keeps it:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ColorSchemeProvider } from "@/lib/ouro/color-scheme";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ColorSchemeProvider>
      <App />
    </ColorSchemeProvider>
  </StrictMode>,
);
```

Building a settings page, a dashboard or a list beside its detail? Install its [page pattern](patterns.md) instead of writing `App.tsx`: `npx shadcn@latest add @ouro/settings-page --yes` (or `@ouro/dashboard-page`, `@ouro/list-detail-page`), then make `src/App.tsx` render `<SettingsPage />` from `@/components/patterns/settings-page`, and go on to step 5.

Otherwise, `src/App.tsx` is the whole page, laid out by Ouro's Stack and PageHeader rather than CSS of its own: start from it and change its fields to what you are building, rather than writing the page from scratch. A component's props are on its page, `https://ui.ouroboros.bot/docs/<item>.md`, and in the JSDoc of the installed source, `src/components/ouro/<item>/<item>.tsx`.

```tsx
import { useState } from "react";
import { Button } from "@/components/ouro/button/button";
import { ColorSchemeToggle } from "@/components/ouro/color-scheme-toggle/color-scheme-toggle";
import { ConfirmDialog } from "@/components/ouro/dialog/confirm-dialog";
import { Form } from "@/components/ouro/form/form";
import { PageHeader } from "@/components/ouro/page-header/page-header";
import { Select } from "@/components/ouro/select/select";
import { Stack } from "@/components/ouro/stack/stack";
import { Switch } from "@/components/ouro/switch/switch";
import { TextField } from "@/components/ouro/text-field/text-field";
import { formErrors, type FormErrors } from "@/lib/ouro/form-answer";

const languages = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
];

export default function App() {
  // Each submit's own answer, so the same mistake shows again after an edit.
  const [answer, setAnswer] = useState<{ errors: FormErrors }>();

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <Stack gap="lg">
        <PageHeader title="Settings" description="Your profile and how we reach you." actions={<ColorSchemeToggle />} />
        <Form
          errors={formErrors(answer, answer?.errors)}
          onSubmit={(event) => {
            // The browser's own checks (required, type="email") pass before this runs.
            event.preventDefault();
            const name = String(new FormData(event.currentTarget).get("name")).trim();
            setAnswer({ errors: name.length < 2 ? { name: "Use at least 2 letters." } : {} });
          }}
        >
          <Stack gap="md">
            <TextField label="Display name" name="name" required autoComplete="nickname" />
            <TextField label="Email" name="email" type="email" required autoComplete="email" />
            <Select label="Language" name="language" defaultValue="en" options={languages} />
            <Switch label="Email notifications" name="notifications" defaultChecked />
            <div>
              <Button type="submit">Save</Button>
            </div>
          </Stack>
        </Form>
        <div>
          <ConfirmDialog
            title="Delete your account?"
            description="This deletes your profile and settings. It can't be undone."
            confirmLabel="Delete account"
            tone="destructive"
            onConfirm={() => setAnswer(undefined)}
            trigger={<Button tone="destructive" variant="soft">Delete account</Button>}
          />
        </div>
      </Stack>
    </main>
  );
}
```

The look comes from the theme. Ouro's components paint themselves from the theme's CSS variables,[^tokens] so the page needs no stylesheet of its own, and a different look is a few variables at the end of `src/index.css`: see [Mix your own paint](theming.md#mix-your-own-paint). Keep `className` for layout, as `App.tsx` does.

Remove what only the template's page used:

```sh
rm -rf src/App.css src/assets public/icons.svg
```

## 5. Build and check

```sh
npm run build
node scripts/ouro/check/check.ts dist --sizes 390x844,1440x900
```

Ouro check opens the build at a phone's and a laptop's size, light and dark, and lists what to fix; leave out `--sizes` to check it at the full set of sizes. On its first run it downloads Chromium itself.

The app is done when the build passes and Ouro check reports `0 finding(s)`. A page pattern passes as installed, so a page that fails has moved off the theme: the finding names the token to use. The components come with their own tests (add `@ouro/<item>-tests` to run them), so tests you write cover your own logic.

## Next

- One component's whole API, with examples: `https://ui.ouroboros.bot/docs/<item>.md`, such as [Form](../Form.md) and [ConfirmDialog](../ConfirmDialog.md).
- Errors from a server, a router's action and the order of checks: [Forms](forms.md).
- A list, navigation, a table or a toast: [llms.txt](https://ui.ouroboros.bot/llms.txt)'s Common needs.
- A component that needs a change: [Changing a component](installing.md#changing-a-component).

[^quickstart]: test:scripts/agent-quickstart.test.mjs::the agent quickstart's app type-checks against the registry, with the files and commands it gives verify:testExists(scripts/agent-quickstart.test.mjs::the agent quickstart's app type-checks against the registry, with the files and commands it gives)
[^namespace]: test:scripts/registry.test.mjs::--from rewrites a released registry.json for the @ouro namespace, keeping its version and docs (Pages serves the newest tag) verify:testExists(scripts/registry.test.mjs::--from rewrites a released registry.json for the @ouro namespace, keeping its version and docs (Pages serves the newest tag))
[^tokens]: test/action-token.test.tsx verify:testExists(test/action-token.test.tsx::the action token > repaints the solid primary Button, as a button and as a link, and leaves every selection on --primary)
