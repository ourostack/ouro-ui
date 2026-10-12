import { type JSX } from "react";
import { Avatar, AvatarGroup } from "@/registry/ouro/components/ouro/avatar/avatar";

// The live demo at the top of docs/avatar/: the component as an app would use it, with its props, nothing else.

export default function AvatarDemo(): JSX.Element {
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <Avatar name="Ada Lovelace" size="sm" />
        <Avatar name="Grace Hopper" />
        <Avatar name="Alan Turing" size="lg" />
      </div>
      <AvatarGroup label="Cooks on this recipe" max={3}>
        <Avatar name="Ada Lovelace" />
        <Avatar name="Grace Hopper" />
        <Avatar name="Alan Turing" />
        <Avatar name="Katherine Johnson" />
        <Avatar name="Edsger Dijkstra" />
      </AvatarGroup>
    </div>
  );
}
