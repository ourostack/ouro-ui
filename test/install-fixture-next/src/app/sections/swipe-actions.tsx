import { Item } from "@/components/ouro/item/item";
import { SwipeActions } from "@/components/ouro/swipe-actions/swipe-actions";

async function deleteRecipe() {
  "use server";
}

async function pinRecipe() {
  "use server";
}

// expect: data-ouro="swipe-actions"
// expect: Ouro swipe row
// expect: aria-label="Actions for Ouro swipe row"
// expect: data-ouro-swipe-actions-side="trailing"
export default function SwipeActionsSection() {
  return (
    <SwipeActions
      label="Ouro swipe row"
      leading={[{ label: "Pin", tone: "primary", onClick: pinRecipe }]}
      trailing={[{ label: "Delete", tone: "destructive", onClick: deleteRecipe }]}
    >
      <Item href="/recipes/short-ribs" title="Ouro swipe row" />
    </SwipeActions>
  );
}
