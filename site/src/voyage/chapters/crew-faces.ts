import type { CrewName } from "../stage/copy";

/**
 * The crew's faces: each a square crop of one figure in the Nautilus scenes, cut by
 * site/scripts/crew-portraits.mts into site/public/crew/. People you sign on keep their initials.
 */
export const CREW_FACES: Record<CrewName, string> = {
  "Captain Nemo": "nemo",
  "Professor Aronnax": "aronnax",
  Conseil: "conseil",
  "Ned Land": "ned",
};

/**
 * A crew member's face at an avatar's size: the 96px cut for the small avatars (32px, three device
 * pixels to one), the 192px cut for anything larger. Anyone else has none, so their avatar shows
 * their initials.
 */
export function crewFace(name: string, size: "sm" | "md" = "sm"): string | undefined {
  if (!Object.hasOwn(CREW_FACES, name)) return undefined;
  return `/crew/${CREW_FACES[name as CrewName]}-${size === "sm" ? 96 : 192}.webp`;
}
