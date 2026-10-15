import { request } from "./fake-backend";

export interface Cookbook {
  id: string;
  name: string;
  recipeCount: number;
  /** How many other cooks it is shared with. */
  sharedWith: number;
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

let cookbooks: Cookbook[] = [
  { id: "weeknight", name: "Weeknight dinners", recipeCount: 12, sharedWith: 0 },
  { id: "holiday", name: "Holiday baking", recipeCount: 8, sharedWith: 3 },
  { id: "lunchbox", name: "Lunchbox ideas", recipeCount: 5, sharedWith: 0 },
];

/** The signed-in cook's cookbooks. */
export function listCookbooks(): Promise<Cookbook[]> {
  return request("listCookbooks", [], () => cookbooks.map((cookbook) => ({ ...cookbook })), 200);
}

/**
 * Deletes a cookbook. Its recipes stay in the cook's library. The server refuses while the
 * cookbook is shared, and says why.
 */
export function deleteCookbook(id: string): Promise<DeleteResult> {
  return request("deleteCookbook", [id], (): DeleteResult => {
    const cookbook = cookbooks.find((candidate) => candidate.id === id);
    if (!cookbook) return { ok: false, error: "That cookbook no longer exists." };
    if (cookbook.sharedWith > 0) {
      return { ok: false, error: `${cookbook.name} is shared with ${cookbook.sharedWith} people. Stop sharing it before you delete it.` };
    }
    cookbooks = cookbooks.filter((candidate) => candidate.id !== id);
    return { ok: true };
  });
}
