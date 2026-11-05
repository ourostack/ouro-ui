import { Avatar, AvatarGroup } from "@/components/ouro/avatar/avatar";

// The initials (drawn from their attribute) and the presence dot are in the server HTML; the
// picture loads on the client.
// expect: aria-label="Ouro avatar"
// expect: data-ouro-avatar-initials="OA"
// expect: aria-label="Ouro person, Busy"
// expect: data-presence="busy"
// expect: data-shape="square"
// expect: aria-label="Ouro cooks"
// expect: data-ouro-avatar-count="+1"
export default function AvatarSection() {
  return (
    <>
      <Avatar name="Ouro avatar" />
      <Avatar name="Ouro person" presence="busy" presenceLabel="Busy" />
      <Avatar name="Ouro team" shape="square" />
      <AvatarGroup label="Ouro cooks" max={1}>
        <Avatar name="Ana Lind" />
        <Avatar name="Grace Hopper" />
      </AvatarGroup>
    </>
  );
}
