/**
 * For each snippet in app.tsx: the habit behind it and every channel that names the fix,
 * with the text that channel must contain.
 *
 * - `tsc`: the compiler's errors for the snippet's line, exactly. A union target is
 *   compared as a set, because members print in the order the program created their
 *   types. `scripts/agent-types.test.mjs` checks these.
 * - `hover`: the editor's hover. That test also checks that every attribute of every
 *   snippet shows its JSDoc, except where `hoverLost` says why not.
 * - `dev`: the `Fix:` of the development message (a console warning, or the error a
 *   component throws). `test/agent-types.test.tsx` renders each snippet and checks it.
 *
 * `names` lists the channels whose text names the fix; every snippet has at least one.
 */
export type Channel = "tsc" | "hover" | "dev";

export interface AgentCase {
  id: string;
  habit: string;
  tsc: string[];
  /** Fix text in the JSDoc of this prop's hover. */
  hover?: { prop: string; doc: string };
  /** The development message's `Fix: …` code. */
  dev?: string;
  names: Channel[];
  /** Why hover shows no JSDoc on this snippet. */
  hoverLost?: string;
}

const variants =
  `(string & { 'From shadcn? Use tone="destructive" or tone="secondary". default is "solid"; ghost and link are "plain"': never; }) | "solid" | "soft" | "outline" | "plain" | undefined`;
const sizes = `"sm" | "md" | "lg" | (string & { 'From shadcn? default is "md"; for icon, pass aria-label with the icon as children': never; }) | undefined`;
const tones = `"primary" | "secondary" | "destructive" | "success" | "warning" | (string & { 'danger is "destructive"; accent is "primary"; neutral is "secondary"': never; }) | undefined`;
const textFieldTypes = `"text" | "email" | "password" | "tel" | "url" | "search" | "date" | "time" | (string & { 'number is <NumberField>; digit codes: inputMode="numeric"': never; }) | undefined`;
const align = `(string & { 'Use "start", "center" or "end": left is "start", right is "end"': never; })`;
const sheetControl = "<Sheet open={open} onOpenChange={setOpen}>";
const dialogControl = "<Dialog open={open} onOpenChange={setOpen}>";
const confirmControl = "<ConfirmDialog open={open} onOpenChange={setOpen}>";
const notAssignable = (value: string, target: string) => `error TS2322: Type '${value}' is not assignable to type '${target}'.`;
const hint = (value: string, fix: string) => notAssignable(value, `{ '${fix}': never; }`);

export const agentCases: AgentCase[] = [
  { id: "s01", habit: "shadcn's ghost variant", tsc: [notAssignable('"ghost"', variants)], dev: '<Button variant="plain">', names: ["tsc", "dev"] },
  { id: "s02", habit: "shadcn's icon size", tsc: [notAssignable('"icon"', sizes)], dev: '<Button aria-label="Add"><PlusIcon /></Button>', names: ["tsc", "dev"] },
  { id: "s03", habit: "a danger tone", tsc: [notAssignable('"danger"', tones)], dev: '<Button tone="destructive">', names: ["tsc", "dev"] },
  { id: "s04", habit: "Radix's asChild", tsc: [hint("boolean", 'Use <Button href="/path">')], dev: '<Button href="/path">', names: ["tsc", "dev"] },
  { id: "s05", habit: "an xs size", tsc: [notAssignable('"xs"', sizes)], dev: '<Button size="md">', names: ["tsc", "dev"] },
  {
    id: "s06",
    habit: "a danger tone on Text",
    tsc: [notAssignable('"danger"', tones.replace(" | undefined", ' | "default" | "muted" | undefined'))],
    dev: '<Text tone="destructive">',
    names: ["tsc", "dev"],
  },
  { id: "s07", habit: "a color prop on Text", tsc: [hint("string", 'Use <Text tone="muted">')], dev: '<Text tone="muted">', names: ["tsc", "dev"] },
  { id: "s08", habit: "MUI's or Chakra's Text variant", tsc: [hint("string", 'Use <Text size="sm" tone="muted">')], dev: '<Text size="sm" tone="muted">', names: ["tsc", "dev"] },
  {
    id: "s09",
    habit: "a Heading with no level",
    tsc: [
      `error TS2741: Property 'level' is missing in type '{ children: string; align: "center"; }' but required in type 'HeadingProps'.`,
    ],
    dev: "<Heading level={2}>",
    names: ["tsc", "dev"],
  },
  {
    id: "s10",
    habit: "a 3xl Heading",
    tsc: [notAssignable('"3xl"', `HeadingSize | (string & { 'Use "sm", "md", "lg", "xl", "2xl" or, larger, "display"': never; }) | undefined`)],
    hover: { prop: "size", doc: "`display` is the hero headline" },
    dev: '<Heading level={1} size="display">',
    names: ["tsc", "hover", "dev"],
  },
  { id: "s11", habit: "a polymorphic as", tsc: [hint("string", "Use <Heading level={2}>")], dev: "<Heading level={2}>", names: ["tsc", "dev"] },
  {
    id: "s12",
    habit: "isOpen and onClose",
    tsc: [hint("boolean", `Use ${sheetControl}`), hint("() => void", `Use ${sheetControl}`)],
    // Without onOpenChange the open-mode check throws first, with its own fix.
    dev: "Pass trigger={<Button>…</Button>} for an uncontrolled sheet, or open and onOpenChange to control it",
    names: ["tsc", "dev"],
  },
  {
    id: "s13",
    habit: "open without onOpenChange",
    tsc: [
      `error TS2322: Type '{ children: string; title: string; side: "bottom"; open: true; }' is not assignable to type 'IntrinsicAttributes & SheetProps'.\n  Property 'onOpenChange' is missing in type '{ children: string; title: string; side: "bottom"; open: true; }' but required in type '{ open: boolean; onOpenChange: (open: boolean) => void; trigger?: never; }'.`,
    ],
    dev: "Pass trigger={<Button>…</Button>} for an uncontrolled sheet, or open and onOpenChange to control it",
    names: ["tsc", "dev"],
  },
  {
    id: "s14",
    habit: "a side that is not one of the four",
    tsc: [notAssignable('"left-ish"', `SheetSide | (string & { 'Use "bottom", "top", "left" or "right"': never; }) | undefined`)],
    dev: '<Sheet side="bottom">',
    names: ["tsc", "dev"],
  },
  {
    id: "s15",
    habit: "hideTitle without a title",
    tsc: [
      `error TS2322: Type '{ children: string; hideTitle: true; trigger: Element; }' is not assignable to type 'IntrinsicAttributes & DialogProps'.\n  Property 'title' is missing in type '{ children: string; hideTitle: true; trigger: Element; }' but required in type 'DialogBaseProps'.`,
    ],
    names: ["tsc"],
  },
  { id: "s16", habit: "shadcn's or Radix's onClose", tsc: [hint("() => void", `Use ${dialogControl}`)], dev: "Pass trigger={<Button>…</Button>} for an uncontrolled dialog, or open and onOpenChange to control it", names: ["tsc", "dev"] },
  {
    id: "s17",
    habit: "both trigger and open",
    tsc: [
      `error TS2322: Type '{ children: string; title: string; size: "sm"; trigger: Element; open: true; onOpenChange: (open: boolean) => void; }' is not assignable to type 'IntrinsicAttributes & DialogProps'.\n  Types of property 'open' are incompatible.\n    Type 'true' is not assignable to type 'undefined'.`,
    ],
    dev: "Pass trigger={<Button>…</Button>} for an uncontrolled dialog, or open and onOpenChange to control it",
    names: ["dev"],
    hoverLost:
      "trigger and open each rule out the other branch; the mode-exclusion props stay `never` because hint types there lose hover in valid code (AGENTS.md rule 6)",
  },
  { id: "s18", habit: "Radix's onCancel", tsc: [hint("() => void", `Use ${confirmControl}`)], dev: confirmControl, names: ["tsc", "dev"] },
  { id: "s19", habit: "a confirmText guess", tsc: [hint("string", 'Use <ConfirmDialog confirmLabel="Delete">')], dev: '<ConfirmDialog confirmLabel="Delete">', names: ["tsc", "dev"] },
  { id: "s20", habit: "shadcn's destructive variant on a confirmation", tsc: [hint("string", 'Use <ConfirmDialog tone="destructive">')], dev: '<ConfirmDialog tone="destructive">', names: ["tsc", "dev"] },
  {
    id: "s21",
    habit: "a danger tone on a confirmation",
    tsc: [notAssignable('"danger"', `"primary" | "destructive" | (string & { 'danger is "destructive"; accent is "primary"': never; }) | undefined`)],
    dev: '<ConfirmDialog tone="destructive">',
    names: ["tsc", "dev"],
  },
  { id: "s22", habit: "a position on Dialog", tsc: [hint("string", 'Use <Sheet side="right">')], dev: '<Sheet side="bottom">', names: ["tsc", "dev"] },
  { id: "s23", habit: "a color on Heading", tsc: [hint("string", 'Use <Text tone="primary">')], dev: '<Text tone="destructive">', names: ["tsc", "dev"] },
  {
    id: "s24",
    habit: "a left alignment on Text",
    tsc: [notAssignable('"left"', `TextAlign | ${align} | undefined`)],
    dev: '<Text align="start">',
    names: ["tsc", "dev"],
  },
  {
    id: "s25",
    habit: "a left alignment on Heading",
    tsc: [notAssignable('"left"', `TextAlign | ${align} | undefined`)],
    dev: '<Heading align="start">',
    names: ["tsc", "dev"],
  },
  {
    id: "s26",
    habit: "a heading tag on Text",
    tsc: [notAssignable('"h2"', `"p" | "span" | "div" | (string & { 'Use "p", "span" or "div"; for a title use Heading': never; }) | undefined`)],
    dev: "<Heading level={2}>",
    names: ["tsc", "dev"],
  },
  {
    id: "s27",
    habit: "an xl Text",
    tsc: [notAssignable('"xl"', `"sm" | "md" | "lg" | (string & { 'Use "sm", "md" or "lg"; for a title use Heading': never; }) | undefined`)],
    dev: "<Heading level={2}>",
    names: ["tsc", "dev"],
  },
  {
    id: "s28",
    habit: "a level past 6",
    tsc: [notAssignable("7", `1 | 2 | 3 | 4 | 5 | 6 | (number & { 'Use 1 to 6; size sets the look': never; })`)],
    dev: "<Heading level={2}>",
    names: ["tsc", "dev"],
  },
  {
    id: "s29",
    habit: "a tone name as the button type",
    tsc: [notAssignable('"primary"', `"button" | "submit" | "reset" | (string & { 'Use "button", "submit" or "reset"; for looks use tone and variant': never; }) | undefined`)],
    dev: '<Button tone="primary">',
    names: ["tsc", "dev"],
  },
  {
    id: "s30",
    habit: "a side that is not one of the four, on the SheetRoot part",
    tsc: [notAssignable('"left-ish"', `SheetSide | (string & { 'Use "bottom", "top", "left" or "right"': never; }) | undefined`)],
    dev: '<SheetRoot side="bottom">',
    names: ["tsc", "dev"],
  },
  {
    id: "s31",
    habit: "an xl DialogPopup part",
    tsc: [notAssignable('"xl"', `DialogSize | (string & { 'Use "sm", "md" or "lg"': never; }) | undefined`)],
    dev: '<DialogPopup size="md">',
    names: ["tsc", "dev"],
  },
  {
    id: "s32",
    habit: "htmlFor on Field",
    tsc: [hint("string", 'Field connects the label itself: <Field label="Email"><FieldControl /></Field>')],
    dev: '<Field label="Email"><FieldControl /></Field>',
    names: ["tsc", "dev"],
  },
  { id: "s33", habit: "an errorMessage prop", tsc: [hint("string", 'Use <Field error="Required.">')], dev: '<Field error="Required.">', names: ["tsc", "dev"] },
  { id: "s34", habit: "MUI's helperText", tsc: [hint("string", 'Use <Field description="...">')], dev: '<Field description="We never share it.">', names: ["tsc", "dev"] },
  { id: "s35", habit: "React Aria's or Chakra's isInvalid", tsc: [hint("boolean", 'Use <Field error="What is wrong">')], dev: '<Field error="What is wrong">', names: ["tsc", "dev"] },
  { id: "s36", habit: "React Aria's or Chakra's isRequired", tsc: [hint("boolean", "Use <Field required>")], dev: "<Field required>", names: ["tsc", "dev"] },
  { id: "s37", habit: "React Aria's or Chakra's isDisabled", tsc: [hint("boolean", "Use <Field disabled>")], dev: "<Field disabled>", names: ["tsc", "dev"] },
  {
    id: "s38",
    habit: "a placeholder as the label",
    tsc: [hint("string", 'Use label="Email"; a placeholder example goes on the control')],
    dev: '<Field label="Email"><FieldControl placeholder="you@example.com" /></Field>',
    names: ["tsc", "dev"],
  },
  { id: "s39", habit: "a label on a group", tsc: [hint("string", 'Use <Fieldset legend="Shipping address">')], dev: '<Fieldset legend="Shipping address">', names: ["tsc", "dev"] },
  { id: "s40", habit: "React Router's to", tsc: [hint("string", 'Use <Link href="/recipes">')], dev: '<Link href="/recipes">', names: ["tsc", "dev"] },
  { id: "s41", habit: "Chakra's isExternal", tsc: [hint("boolean", 'Use <Link href="https://..." external>')], dev: '<Link href="https://…" external>', names: ["tsc", "dev"] },
  { id: "s42", habit: "a danger tone on Link", tsc: [notAssignable('"danger"', tones)], dev: '<Link tone="destructive">', names: ["tsc", "dev"] },
  {
    id: "s43",
    habit: "a number input",
    tsc: [notAssignable('"number"', textFieldTypes)],
    dev: '<NumberField label="Servings" />, or <TextField inputMode="numeric"> for digit codes',
    names: ["tsc", "dev"],
  },
  { id: "s44", habit: "MUI's helperText on TextField", tsc: [hint("string", 'Use <TextField description="...">')], dev: '<TextField description="We never share it.">', names: ["tsc", "dev"] },
  { id: "s45", habit: "a prefix prop", tsc: [hint("string", 'Use <TextField startAdornment="$">')], dev: '<TextField startAdornment="$">', names: ["tsc", "dev"] },
  { id: "s46", habit: "MUI's multiline", tsc: [hint("boolean", 'Use <TextArea label="Notes" autoGrow />')], dev: '<TextArea label="Notes" autoGrow />', names: ["tsc", "dev"] },
  { id: "s47", habit: "React Select's isClearable", tsc: [hint("boolean", "Use <TextField clearable>")], dev: "<TextField clearable>", names: ["tsc", "dev"] },
  { id: "s48", habit: "MUI's minRows", tsc: [hint("number", "Use <TextArea autoGrow rows={2} maxRows={8}>")], dev: "<TextArea autoGrow rows={2} maxRows={8}>", names: ["tsc", "dev"] },
  { id: "s49", habit: "an autoResize prop", tsc: [hint("boolean", "Use <TextArea autoGrow>")], dev: "<TextArea autoGrow>", names: ["tsc", "dev"] },
  {
    id: "s50",
    habit: "a placeholder as the label",
    tsc: [`error TS2741: Property 'label' is missing in type '{ placeholder: string; }' but required in type 'TextFieldOwnProps'.`],
    dev: '<TextField label="Email" hideLabel> to hide a label you still need',
    names: ["tsc", "dev"],
  },
  { id: "v01", habit: "shadcn's destructive variant", tsc: [notAssignable('"destructive"', variants)], dev: '<Button tone="destructive">', names: ["tsc", "dev"] },
  { id: "v02", habit: "shadcn's default variant", tsc: [notAssignable('"default"', variants)], dev: "<Button>", names: ["tsc", "dev"] },
  { id: "v03", habit: "shadcn's secondary variant", tsc: [notAssignable('"secondary"', variants)], dev: '<Button tone="secondary">', names: ["tsc", "dev"] },
  { id: "v04", habit: "shadcn's link variant", tsc: [notAssignable('"link"', variants)], dev: '<Button variant="plain" href="/path">', names: ["tsc", "dev"] },
  { id: "v05", habit: "shadcn's default size", tsc: [notAssignable('"default"', sizes)], dev: '<Button size="md">', names: ["tsc", "dev"] },
];

/** Valid snippets: no type error, no development message, and hover on every prop. */
export const validSnippets = ["ok01", "ok02", "ok03", "ok04", "ok05", "ok06", "ok07", "ok08", "ok09", "ok10", "ok11", "ok12"];
