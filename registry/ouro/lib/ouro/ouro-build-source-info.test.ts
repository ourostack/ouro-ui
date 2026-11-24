import { describe, expect, it } from "vitest";
import { buildSourceInfo } from "@/registry/ouro/lib/ouro/ouro-build-source-info";

describe("buildSourceInfo", () => {
  const git = { branch: "main", root: "/code/recipes", sha: "abc123", dirty: false, behindOfficial: 0 };

  it("carries the app name and git facts through unchanged", () => {
    expect(buildSourceInfo("recipes", git)).toEqual({
      app: "recipes",
      branch: "main",
      worktree: "recipes",
      sha: "abc123",
      dirty: false,
      behind: 0,
      serviceFiles: [],
    });
  });

  it("names the worktree from the checkout root's last path segment", () => {
    expect(buildSourceInfo("recipes", { ...git, root: "/code/ouro-ui-worktrees/drain4-recipes" }).worktree).toBe("drain4-recipes");
    expect(buildSourceInfo("recipes", { ...git, root: "/" }).worktree).toBe("/");
  });

  it("reads dirty and behind from git, and passes serviceFiles through", () => {
    expect(buildSourceInfo("recipes", { ...git, dirty: true }).dirty).toBe(true);
    expect(buildSourceInfo("recipes", { ...git, behindOfficial: 4 }).behind).toBe(4);
    expect(buildSourceInfo("recipes", git, ["/sw.js"]).serviceFiles).toEqual(["/sw.js"]);
  });

  it("reads 0 behind when it could not be read, rather than null", () => {
    expect(buildSourceInfo("recipes", { ...git, behindOfficial: null }).behind).toBe(0);
  });
});
