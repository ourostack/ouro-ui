import assert from "node:assert/strict";
import { test } from "node:test";
import { addedEntries, exemptionProblems, physicalEntries, storyEntries } from "./conformance-exemptions.mjs";

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
