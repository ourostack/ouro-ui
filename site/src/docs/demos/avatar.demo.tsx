import { type JSX } from "react";
import { Avatar, AvatarGroup } from "@/registry/ouro/components/ouro/avatar/avatar";

// The live demo at the top of docs/avatar/: the component as an app would use it, with its props, nothing else.

const coverArt =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#db2777"/></linearGradient></defs><rect width="48" height="48" fill="url(#g)"/><circle cx="34" cy="14" r="7" fill="#fde68a"/><path d="M0 48V34l14-10 12 9 10-6 12 8v13z" fill="#0f172a" fill-opacity=".55"/></svg>',
  );

export default function AvatarDemo(): JSX.Element {
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <Avatar name="Ana Lind" size="sm" presence="available" presenceLabel="Available" />
        <Avatar name="Grace Hopper" presence="busy" presenceLabel="In a meeting" />
        <Avatar name="Alan Turing" size="lg" presence="away" presenceLabel="Away" />
        <Avatar name="Design reviews" size="lg" shape="square" />
        <Avatar name="Halden" size="lg" shape="agent" presence="available" presenceLabel="Available" />
        <Avatar name="Platform" size="lg" shape="square" src={coverArt} />
      </div>
      <AvatarGroup label="Cooks on this recipe" max={3}>
        <Avatar name="Ana Lind" />
        <Avatar name="Grace Hopper" />
        <Avatar name="Alan Turing" />
        <Avatar name="Katherine Johnson" />
        <Avatar name="Edsger Dijkstra" />
      </AvatarGroup>
    </div>
  );
}
