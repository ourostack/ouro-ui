import { request } from "./fake-backend";

export interface Recipe {
  id: string;
  title: string;
  /** Total time, in minutes. */
  minutes: number;
  servings: number;
}

export interface RecipePage {
  recipes: Recipe[];
  /** 1-based. */
  page: number;
  pageCount: number;
  total: number;
}

export const pageSize = 10;

const titles = [
  "Crispy chickpea salad",
  "Lemon garlic roast chicken",
  "Weeknight beef ragu",
  "Miso glazed salmon",
  "Spiced lentil soup",
  "Shakshuka with feta",
  "Mushroom risotto",
  "Black bean tacos",
  "Thai green curry",
  "Buttermilk pancakes",
  "Roasted tomato soup",
  "Chicken katsu",
  "Sesame noodles",
  "Pea and mint pasta",
  "Baked falafel",
  "Pork carnitas",
  "Halloumi traybake",
  "Coconut dal",
  "Garlic butter prawns",
  "Banana bread",
  "Sweet potato chili",
  "Greek lemon potatoes",
  "Kimchi fried rice",
  "Caesar salad",
  "Beef pho",
  "Spinach and ricotta cannelloni",
  "Fish pie",
  "Chana masala",
  "Pesto gnocchi",
  "Sticky toffee pudding",
  "Chicken tikka skewers",
  "Ratatouille",
  "Cauliflower cheese",
  "Teriyaki tofu bowls",
  "Leek and potato soup",
  "Lamb kofta",
  "Corn fritters",
  "Paella",
  "Carrot cake",
  "Pulled jackfruit buns",
  "Tuna nicoise",
  "French onion soup",
  "Gochujang chicken wings",
  "Mac and cheese",
  "Apple crumble",
  "Vegetable samosas",
  "Lemon drizzle cake",
];

let recipes: Recipe[] = titles.map((title, index) => ({
  id: `recipe-${index + 1}`,
  title,
  minutes: 15 + ((index * 7) % 60),
  servings: 2 + (index % 5),
}));

/** One page of the signed-in cook's recipes, newest first. `page` is 1-based. */
export function listRecipes(page: number): Promise<RecipePage> {
  return request(
    "listRecipes",
    [page],
    () => {
      const pageCount = Math.max(1, Math.ceil(recipes.length / pageSize));
      const current = Math.min(Math.max(1, page), pageCount);
      return {
        recipes: recipes.slice((current - 1) * pageSize, current * pageSize),
        page: current,
        pageCount,
        total: recipes.length,
      };
    },
    250,
  );
}

/** Moves a recipe to the archive. It no longer appears in `listRecipes`. */
export function archiveRecipe(id: string): Promise<void> {
  return request("archiveRecipe", [id], () => {
    recipes = recipes.filter((recipe) => recipe.id !== id);
  });
}

/** Deletes a recipe for good. */
export function deleteRecipe(id: string): Promise<void> {
  return request("deleteRecipe", [id], () => {
    recipes = recipes.filter((recipe) => recipe.id !== id);
  });
}
