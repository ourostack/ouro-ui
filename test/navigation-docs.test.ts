import { describe, expect, it } from "vitest";
import navbar from "../docs/Navbar.md?raw";
import sidebar from "../docs/Sidebar.md?raw";
import sidebarLayout from "../docs/SidebarLayout.md?raw";
import stackedLayout from "../docs/StackedLayout.md?raw";

// The phone menus need JavaScript, as in shadcn/ui and Catalyst; the docs say so.
describe("Navigation docs on JavaScript", () => {
  it.each([
    ["Navbar", navbar],
    ["Sidebar", sidebar],
    ["SidebarLayout", sidebarLayout],
    ["StackedLayout", stackedLayout],
  ])("%s's docs say the phone menu opens once JavaScript has loaded", (_name, doc) => {
    expect(doc).toContain("opens once JavaScript has loaded");
  });

  it.each([
    ["Sidebar", sidebar],
    ["SidebarLayout", sidebarLayout],
    ["StackedLayout", stackedLayout],
  ])("%s's docs say the links are in the server HTML from 640px up", (_name, doc) => {
    expect(doc).toContain("in the server HTML from 640px up");
  });

  it("says Navbar's menu button and links are both in the server HTML, so the bar does not change on hydration", () => {
    expect(navbar).toContain("Both the links and the menu button are in the server HTML");
  });
});
