// What agents write with avatar: snippets whose cases are in avatar.cases.ts.
import { Avatar, AvatarGroup } from "@/registry/ouro/components/ouro/avatar/avatar";

export const avatar01 = <Avatar src="/ada.jpg" alt="Ada Lovelace" />;
export const avatar02 = <Avatar name="Ada Lovelace">AL</Avatar>;
export const avatar03 = <Avatar name="Ada Lovelace" fallback="AL" />;
export const avatar04 = <Avatar name="Ada Lovelace" size="2xl" />;
export const avatarOk01 = <Avatar name="Ada Lovelace" src="/ada.jpg" initials="AL" alt="" size="lg" />;
export const avatarOk02 = (
  <AvatarGroup label="Cooks" max={3} total={12} size="sm">
    <Avatar name="Ada Lovelace" />
  </AvatarGroup>
);
