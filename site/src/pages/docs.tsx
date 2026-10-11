import type { JSX, ReactNode } from "react";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { agentExamples } from "../agents/examples";
import { CodeBlock, Command, InlineCode } from "../components/code";
import { DocsShell } from "../components/layout";
import { demos } from "../docs/demos";
import { docsItems, GITHUB, installedPaths, partsSection, summary, type DocsItem } from "../docs/items";
import { inline, Markdown, parse, type Block } from "../docs/markdown";
import { href } from "../routes";
import upgrading from "../../../UPGRADING.md?raw";

function PageTitle({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: ReactNode }): JSX.Element {
  return (
    <header className="mb-10">
      <p className="m-0 mb-3 text-sm font-medium text-primary">{eyebrow}</p>
      <Heading level={1} size="2xl">
        {title}
      </Heading>
      <Text size="lg" tone="muted" className="mt-4 max-w-[40rem] text-pretty">
        {lead}
      </Text>
    </header>
  );
}

/** The generated page's blocks, split into its purpose, its import line and the rest. */
function pageBlocks(item: DocsItem): { purpose: string; importLine: string; body: Block[] } {
  const blocks = parse(installedPaths(item.markdown));
  const [, purpose, importBlock, ...rest] = blocks;
  if (purpose?.kind !== "paragraph" || importBlock?.kind !== "code") throw new Error(`docs/${item.title}.md changed shape`);
  // The "Parts" section links to docs/parts.md; the site shows that nesting in place.
  const body = rest.map((block) =>
    block.kind === "paragraph"
      ? { ...block, text: block.text.replace(/ See \[parts\.md\]\(parts\.md#[\w-]+\) for the required nesting\./, " The nesting they need follows.") }
      : block,
  );
  if (item.parts) {
    const at = body.findIndex((block) => block.kind === "heading" && block.text === "Parts");
    const next = body.findIndex((block, index) => index > at && block.kind === "heading" && block.level <= 2);
    // Without the family's opening line, which repeats the root part's description.
    const parts = parse(installedPaths(partsSection(item.parts))).slice(1);
    body.splice(next === -1 ? body.length : next, 0, ...parts);
  }
  return { purpose: purpose.text, importLine: importBlock.text, body };
}

export function DocsComponent({ item }: { item: DocsItem }): JSX.Element {
  const { purpose, importLine, body } = pageBlocks(item);
  const Demo = demos[item.name]!;
  return (
    <DocsShell current={`/docs/${item.name}/`}>
      <PageTitle eyebrow={item.group} title={item.title} lead={inline(purpose)} />
      <section
        aria-label="Live demo"
        className="flex min-h-48 items-center justify-center rounded-2xl border border-border bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:16px_16px] px-5 py-10 sm:px-10"
      >
        <Demo />
      </section>

      <Heading level={2} size="lg" id="install" className="mt-14 mb-4">
        Install
      </Heading>
      <div className="grid gap-3">
        <Text size="sm" tone="muted">
          Once per app, with Tailwind CSS v4 and an <InlineCode>@/*</InlineCode> path alias (Ouro UI is built on Base UI, so{" "}
          <InlineCode>--base base</InlineCode>; skip <InlineCode>-t</InlineCode> in an existing app):
        </Text>
        <Command command="npx shadcn@latest init --base base --preset nova --yes --no-monorepo" />
        <Command command={`npx shadcn@latest add ourostack/ouro-ui/${item.name}`} />
        <Text size="sm" tone="muted">
          Or, with the <a href={`${href("/")}#install`} className="text-primary underline underline-offset-4">@ouro namespace</a> set
          up:
        </Text>
        <Command command={`npx shadcn@latest add @ouro/${item.name}`} />
        <Text size="sm" tone="muted">
          Its tests, stories and Playwright spec are optional, with Vitest, Storybook and Playwright as devDependencies:
        </Text>
        <Command command={`npx shadcn@latest add ourostack/ouro-ui/${item.name} ourostack/ouro-ui/${item.name}-tests`} />
        <CodeBlock code={importLine} className="mt-2" />
        <Text size="sm" tone="muted">
          Paths use shadcn's default <InlineCode>@/</InlineCode> alias; the CLI rewrites them to yours.
        </Text>
      </div>

      <Markdown blocks={body} />

      <div className="mt-14 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-6 text-sm">
        <a href={`${GITHUB}/blob/main/${item.source}`} className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Source on GitHub
        </a>
        <a href={href(`/docs/${item.name}.md`)} className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
          This page as Markdown
        </a>
      </div>
    </DocsShell>
  );
}

export function DocsIndex(): JSX.Element {
  const groups = ["Actions", "Text", "Overlays"] as const;
  const card =
    "group grid h-full gap-1.5 rounded-xl border border-border p-4 no-underline outline-ring transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2";
  return (
    <DocsShell current="/docs/">
      <PageTitle
        eyebrow="Docs"
        title="Components"
        lead="Every Ouro UI component, with a live demo, install commands, its props and what to use instead. The same docs live in each component's JSDoc, so an agent reading the installed source sees them too."
      />
      {groups.map((group) => (
        <section key={group} aria-labelledby={`group-${group}`} className="mt-10">
          <Heading level={2} size="md" id={`group-${group}`} className="mb-4">
            {group}
          </Heading>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
            {docsItems
              .filter((item) => item.group === group)
              .map((item) => (
                <li key={item.name}>
                  <a href={href(`/docs/${item.name}/`)} className={card}>
                    <span className="font-medium text-foreground">{item.title}</span>
                    <span className="text-sm leading-6 text-muted-foreground">{inline(summary(item.markdown))}</span>
                  </a>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <section aria-labelledby="group-guides" className="mt-10">
        <Heading level={2} size="md" id="group-guides" className="mb-4">
          Guides
        </Heading>
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
          <li>
            <a href={href("/docs/switching-from-shadcn/")} className={card}>
              <span className="font-medium text-foreground">Switching from shadcn</span>
              <span className="text-sm leading-6 text-muted-foreground">Each shadcn/ui component and prop, and its Ouro UI equivalent.</span>
            </a>
          </li>
          <li>
            <a href={href("/docs/updating/")} className={card}>
              <span className="font-medium text-foreground">Updating installed components</span>
              <span className="text-sm leading-6 text-muted-foreground">Review upstream changes, then overwrite and reapply your edits.</span>
            </a>
          </li>
        </ul>
      </section>
    </DocsShell>
  );
}

const switchingIntro = `Ouro UI follows the shadcn/ui registry standard and reads the same theme variables, so switching is one component at a time, not a migration.`;

const switchingCoexist = `
## Both live in one app

shadcn/ui installs to \`components/ui/\`. Ouro UI installs to \`components/ouro/\`, so a shadcn \`button\` and an Ouro \`button\` never collide. Switch a screen at a time, and remove the shadcn file when nothing imports it any more.

Ouro components read shadcn's variables (\`--primary\`, \`--muted-foreground\`, \`--radius\` and the rest), so your theme carries over unchanged. Dark mode is the same \`.dark\` class. Ouro UI adds only what shadcn themes lack, in \`ouro-base.css\`: \`--success\` and \`--warning\` with their foregrounds, \`--destructive-foreground\`, and the motion tokens. The Ouro look (\`ouro-theme\`) is optional; skip it to keep yours.

## Components

| shadcn/ui | Ouro UI | Notes |
| --- | --- | --- |
| \`Button\` | \`Button\` | Same name; the props differ (below). |
| \`Dialog\` with \`DialogTrigger\`, \`DialogContent\`, \`DialogHeader\`, \`DialogTitle\`, \`DialogDescription\`, \`DialogFooter\` | \`Dialog\` with \`trigger\`, \`title\`, \`description\` and \`footer\` | Becomes a bottom sheet below 640px. Parts exist for layouts the props can't express. |
| \`Sheet\` with \`SheetTrigger\`, \`SheetContent\`, \`SheetHeader\`, \`SheetTitle\` | \`Sheet\` with \`trigger\`, \`side\` and \`title\` | Dragged back to its edge to dismiss. |
| \`Drawer\` | \`Sheet\` with \`snapPoints\` | \`snapPoints={[0.5, 1]}\` opens at half height. |
| \`AlertDialog\` | \`ConfirmDialog\` | Cancel has focus first; an outside press doesn't dismiss it. |
| Classes on \`<h1>\` to \`<h6>\` | \`Heading\` with \`level\` and \`size\` | \`level\` sets the tag; \`size\` only the look. |
| Classes on \`<p>\` (\`text-sm text-muted-foreground\`) | \`Text\` with \`size\` and \`tone\` | \`<Text size="sm" tone="muted">\` |

## Button props

| shadcn/ui | Ouro UI |
| --- | --- |
| \`variant="default"\` | The default: \`<Button>\` |
| \`variant="destructive"\` | \`tone="destructive"\` |
| \`variant="secondary"\` | \`tone="secondary"\` |
| \`variant="outline"\` | \`variant="outline" tone="secondary"\` |
| \`variant="ghost"\` | \`variant="plain"\`, with \`tone="secondary"\` for foreground-colored text |
| \`variant="link"\` | \`variant="plain"\` with \`href\` |
| \`size="default"\` | \`size="md"\`, the default |
| \`asChild\` around a link | \`href\`, which renders a link (internal paths go through \`OuroProvider\`'s \`linkComponent\`) |
| \`disabled\` while saving | \`loading\`, which also shows a spinner and keeps focus |
| An icon as a child | \`startIcon={Icon}\` or \`endIcon={Icon}\` |
| \`className="w-full"\` | \`fullWidth\` |
| Appearance classes (\`bg-red-500\`) | \`tone\`, \`variant\` and \`size\`; \`className\` is for layout |

## Dialog and Sheet props

| shadcn/ui | Ouro UI |
| --- | --- |
| \`open\` and \`onOpenChange\` | The same |
| \`<DialogTrigger asChild>\` around a button | \`trigger={<Button>Edit</Button>}\` |
| \`<DialogTitle>\` | \`title\`, required (\`hideTitle\` hides it visually) |
| \`<DialogDescription>\` | \`description\` |
| \`<DialogFooter>\` | \`footer\`, primary action last |
| \`<SheetContent side="right">\` | \`<Sheet side="right">\` |

## AlertDialog to ConfirmDialog

| shadcn/ui | Ouro UI |
| --- | --- |
| \`<AlertDialogTitle>\` | \`title\`, the question |
| \`<AlertDialogDescription>\` | \`description\` |
| \`<AlertDialogAction onClick={…}>Delete</AlertDialogAction>\` | \`confirmLabel="Delete"\` and \`onConfirm\`; return a promise to show progress |
| \`<AlertDialogCancel>\` | \`cancelLabel\`, \`"Cancel"\` by default |
| A destructive class on the action | \`tone="destructive"\` |

## If you miss one

Shadcn's prop names that Ouro UI doesn't use, and its Button variant and size values, fail the type check, and the error names the Ouro prop to use. In development, Button's console message names the fix for each guard prop and each shadcn variant and size:
`;

export function Switching(): JSX.Element {
  const example = agentExamples[0]!;
  return (
    <DocsShell current="/docs/switching-from-shadcn/">
      <PageTitle eyebrow="Guide" title="Switching from shadcn" lead={switchingIntro} />
      <Markdown blocks={parse(switchingCoexist)} />
      <CodeBlock code={`${example.code}\n\n${example.devMessage}`} />
    </DocsShell>
  );
}

export function Updating(): JSX.Element {
  return (
    <DocsShell current="/docs/updating/">
      <PageTitle
        eyebrow="Guide"
        title="Updating installed components"
        lead="Ouro UI components are copied into your project, so they're yours to edit. As with shadcn/ui, there's no install manifest: to take an upstream change, compare first, then decide."
      />
      <ol className="m-0 grid list-none gap-12 p-0">
        <li className="grid gap-3">
          <Heading level={2} size="lg">
            1. Review the change
          </Heading>
          <Text>List the files the registry's current version would change. Each one marked overwrite differs from yours:</Text>
          <Command command="npx shadcn@latest add @ouro/sheet --dry-run" />
          <Text>Then see the difference for each of those files by its path:</Text>
          <Command command="npx shadcn@latest add @ouro/sheet --diff src/components/ouro/sheet/sheet.tsx" />
          <Text size="sm" tone="muted">
            Without the namespace, use <InlineCode>ourostack/ouro-ui/sheet</InlineCode> in place of <InlineCode>@ouro/sheet</InlineCode>. A bare{" "}
            <InlineCode>--diff</InlineCode> without a path can stop after the first few unchanged files, before the one you edited.
          </Text>
        </li>
        <li className="grid gap-3">
          <Heading level={2} size="lg">
            2. Overwrite, then reapply your edits
          </Heading>
          <Text>
            The CLI replaces files; it doesn't merge. Commit first, so your edits are safe, then overwrite:
          </Text>
          <Command command="npx shadcn@latest add @ouro/sheet --overwrite" />
          <Command command="git diff" />
          <Text>The diff shows the upstream change and, mixed in, your own edits being removed. Bring back the ones you still want.</Text>
        </li>
        <li className="grid gap-3">
          <Heading level={2} size="lg">
            3. Run the tests that came with it
          </Heading>
          <Text>
            A component's unit tests, stories and end-to-end specs are its optional <InlineCode>-tests</InlineCode> item. If you
            installed them, update them with the component, then run them before you commit:
          </Text>
          <Command command="npx shadcn@latest add @ouro/sheet @ouro/sheet-tests --overwrite" />
          <Text size="sm" tone="muted">
            To add them, run the same command without <InlineCode>--overwrite</InlineCode>. <InlineCode>ouro-tests</InlineCode>{" "}
            adds every component's tests.
          </Text>
        </li>
        <li className="grid gap-3">
          <Heading level={2} size="lg">
            Upgrading from v0.1.0
          </Heading>
          {/* UPGRADING.md, the same note as README.md and the release notes; CI runs its commands. */}
          <Markdown blocks={parse(upgrading).slice(1)} />
        </li>
        <li className="grid gap-3">
          <Heading level={2} size="lg">
            Pin a version
          </Heading>
          <Text>
            Add a tag to install a release instead of the latest code:
          </Text>
          <Command command="npx shadcn@latest add ourostack/ouro-ui/sheet#v0.2.0" />
          <Text size="sm" tone="muted">
            A release tag pins the item and every Ouro dependency it brings (such as <InlineCode>ouro-lib</InlineCode> and{" "}
            <InlineCode>button</InlineCode>) to the same tag. Any other ref, <InlineCode>#&lt;sha&gt;</InlineCode> or{" "}
            <InlineCode>#&lt;branch&gt;</InlineCode>, pins only the item you name: its Ouro dependencies come from <InlineCode>main</InlineCode>.
            The <InlineCode>@ouro</InlineCode> namespace always serves <InlineCode>main</InlineCode>. Releases are listed on{" "}
            <a href={`${GITHUB}/releases`} className="text-primary underline underline-offset-4">GitHub</a>.
          </Text>
        </li>
      </ol>
    </DocsShell>
  );
}

export function NotFound(): JSX.Element {
  return (
    <DocsShell current="">
      <PageTitle eyebrow="404" title="Page not found" lead={<>That page isn't here. The <a href={href("/docs/")} className="text-primary underline underline-offset-4">docs</a> list every component.</>} />
    </DocsShell>
  );
}
