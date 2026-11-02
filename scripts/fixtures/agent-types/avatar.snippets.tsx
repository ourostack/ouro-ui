// What agents write with avatar: snippets whose cases are in avatar.cases.ts.
import { Avatar, AvatarGroup } from "@/registry/ouro/components/ouro/avatar/avatar";

export const avatar01 = <Avatar src="/ana.jpg" alt="Ana Lind" />;
export const avatar02 = <Avatar name="Ana Lind">AL</Avatar>;
export const avatar03 = <Avatar name="Ana Lind" fallback="AL" />;
export const avatar04 = <Avatar name="Ana Lind" size="4xl" />;
export const avatar05 = <Avatar name="Ana Lind" presence="busy" />;
export const avatar06 = <Avatar name="Ana Lind" presence="dnd" presenceLabel="Do not disturb" />;
export const avatar07 = <Avatar name="Design reviews" shape="rounded" />;
export const avatar08 = <Avatar name="Halden" shape="agent" />;
export const avatarOk01 = <Avatar name="Ana Lind" src="/ana.jpg" initials="AL" alt="" size="lg" />;
export const avatarOk02 = <AvatarGroup label="Cooks" max={3} total={12} size="sm"><Avatar name="Ana Lind" /></AvatarGroup>;
export const avatarOk03 = <Avatar name="Ana Lind" presence="away" presenceLabel="Away" shape="square" color="brand" idForColor="u-1" />;
export const avatarOk04 = <Avatar name="Halden" shape="hexagon" src="/halden.png" alt="" />;
