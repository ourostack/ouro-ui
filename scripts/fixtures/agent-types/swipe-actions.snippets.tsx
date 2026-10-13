// What agents write with swipe-actions: snippets whose cases are in swipe-actions.cases.ts.
import { SwipeActions } from "@/registry/ouro/components/ouro/swipe-actions/swipe-actions";

const remove = () => {};

export const swipeActions01 = <SwipeActions label="Ribs" actions={[{ label: "Delete", onClick: remove }]}>Ribs</SwipeActions>;
export const swipeActions02 = <SwipeActions label="Ribs" right={[{ label: "Delete", onClick: remove }]}>Ribs</SwipeActions>;
export const swipeActions03 = <SwipeActions label="Ribs" leftActions={[{ label: "Pin", onClick: remove }]}>Ribs</SwipeActions>;
export const swipeActions04 = <SwipeActions label="Ribs" onDelete={remove}>Ribs</SwipeActions>;
export const swipeActions05 = <SwipeActions trailing={[{ label: "Delete", onClick: remove }]}>Ribs</SwipeActions>;
export const swipeActions06 = <SwipeActions label="Ribs" trailing={[{ label: "Delete", tone: "danger", onClick: remove }]}>Ribs</SwipeActions>;
export const swipeActions07 = <SwipeActions label="Ribs" trailing={[{ label: "Delete", variant: "destructive", onClick: remove }]}>Ribs</SwipeActions>;
export const swipeActionsOk01 = <SwipeActions label="Ribs" leading={[{ label: "Pin", tone: "primary", onClick: remove }]} trailing={[{ label: "Delete", tone: "destructive", onClick: remove }, { label: "Archive", onClick: remove }]} actionsLabel="Actions for {label}" className="mt-2">Ribs</SwipeActions>;
