// What agents write with hover card: snippets whose cases are in hover-card.cases.ts.
import { HoverCard } from "@/registry/ouro/components/ouro/hover-card/hover-card";
import { Link } from "@/registry/ouro/components/ouro/link/link";

export const hoverCard01 = <HoverCard trigger={<Link href="/cooks/ari">Ari</Link>} openDelay={200}>Preview</HoverCard>;
export const hoverCard02 = <HoverCard trigger={<Link href="/cooks/ari">Ari</Link>} align="left">Preview</HoverCard>;
export const hoverCardOk01 = <HoverCard trigger={<Link href="/cooks/ari">Ari</Link>} side="top" className="w-96">Preview</HoverCard>;
