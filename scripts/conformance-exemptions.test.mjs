import assert from "node:assert/strict";
import { test } from "node:test";
import { addedEntries, exemptionProblems, physicalEntries, storyEntries, storyShapeProblems } from "./conformance-exemptions.mjs";

test("physicalEntries lists one exemption per file and class, with its reason", () => {
  assert.deepEqual(physicalEntries({ "a.tsx": { "left-1/2": "centred", "pr-2": " " } }), [
    { key: "physicalAllowed a.tsx left-1/2", mention: "left-1/2", reason: "centred" },
    { key: "physicalAllowed a.tsx pr-2", mention: "pr-2", reason: "" },
  ]);
});

test("storyEntries reads each focusExit control and clientOnly from a story file's conformance parameters, by story", () => {
  const text = `
    const meta = { parameters: { conformance: { clientOnly: "portals on its first render" } } };
    export default meta;
    export const Docs: Story = { parameters: { conformance: { focusExit: { "link/root Docs": "opens the docs", "unmarked/? Out": "" } } } };
    export const Plain: Story = { parameters: { conformance: { announces: { Save: "Saved" } } } };
  `;
  assert.deepEqual(storyEntries("registry/ouro/components/ouro/side-nav/side-nav.stories.tsx", text), [
    { key: "clientOnly SideNav", mention: "SideNav", reason: "portals on its first render" },
    { key: "focusExit SideNav/Docs link/root Docs", mention: "link/root Docs", reason: "opens the docs" },
    { key: "focusExit SideNav/Docs unmarked/? Out", mention: "unmarked/? Out", reason: "" },
  ]);
});

test("a new exemption needs its reason and a mention in the description; one the base has needs neither", () => {
  const base = [{ key: "physicalAllowed a.tsx left-1/2", mention: "left-1/2", reason: "centred" }];
  const head = [...base, { key: "physicalAllowed b.tsx pr-2", mention: "pr-2", reason: "" }, { key: "clientOnly Sheet/Feel", mention: "Sheet/Feel", reason: "portals" }];
  const added = addedEntries(base, head);
  assert.deepEqual(added.map(({ key }) => key), ["physicalAllowed b.tsx pr-2", "clientOnly Sheet/Feel"]);
  assert.deepEqual(exemptionProblems(added, "Adds `Sheet/Feel`: it portals."), [
    "physicalAllowed b.tsx pr-2: needs its reason",
    'physicalAllowed b.tsx pr-2: name "pr-2" in the pull request\'s description, with why',
  ]);
  assert.deepEqual(exemptionProblems(added.slice(1), "Sheet/Feel portals"), []);
});

test("storyShapeProblems fails every conformance parameter it cannot read as a literal, so no exemption escapes the ratchet", () => {
  const path = "registry/ouro/components/ouro/side-nav/side-nav.stories.tsx";
  const literal = `export const Docs: Story = { parameters: { layout: "centered", conformance: { clientOnly: "portals", focusExit: { "link/root Docs": "opens the docs" }, announces: { Save: "Saved" } } } };`;
  assert.deepEqual(storyShapeProblems(path, literal), []);
  const shapes = {
    shorthand: `const conformance = { clientOnly: "x" }; export const A: Story = { parameters: { conformance } };`,
    variable: `export const A: Story = { parameters: { conformance: shared } };`,
    "exits variable": `export const A: Story = { parameters: { conformance: { focusExit: exits } } };`,
    "conformance spread": `export const A: Story = { parameters: { conformance: { ...base, clientOnly: "x" } } };`,
    "parameters spread": `export const A: Story = { parameters: { ...shared, layout: "centered" } };`,
    "parameters variable": `export const A: Story = { parameters: shared };`,
    "parameters shorthand": `const parameters = {}; export const A: Story = { parameters };`,
    "computed key": "export const A: Story = { parameters: { conformance: { focusExit: { [key]: \"x\" } } } };",
    "reason variable": `export const A: Story = { parameters: { conformance: { focusExit: { "link/root Docs": reason } } } };`,
    "clientOnly variable": `export const A: Story = { parameters: { conformance: { clientOnly: reason } } };`,
    "template reason": "export const A: Story = { parameters: { conformance: { clientOnly: `portals ${why}` } } };",
    "assigned later": `export const A: Story = {}; A.parameters = { conformance: { clientOnly: "x" } };`,
    "member assigned": `export const A: Story = { parameters: {} }; A.parameters.conformance = { clientOnly: "x" };`,
  };
  for (const [shape, text] of Object.entries(shapes)) {
    const problems = storyShapeProblems(path, text);
    assert.equal(problems.length > 0, true, shape);
    assert.match(problems[0], /^registry\/ouro\/components\/ouro\/side-nav\/side-nav\.stories\.tsx:\d+: /, shape);
  }
});
