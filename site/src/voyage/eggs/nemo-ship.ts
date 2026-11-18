/**
 * The Nautilus the "nemo" egg sails: a cut-out of the painted ship, afloat by the shipyard, by day for a light page and
 * by night for a dark one. site/scripts/nemo-ship.mts cuts both into site/public/eggs/ at 420 and 840 pixels wide.
 */
export const NEMO_SHIPS = {
  /** Height at 420 wide, and where her lit portholes are, as a share of the picture's width and height. */
  day: { height: 130, light: { x: 0.54, y: 0.48 } },
  night: { height: 105, light: { x: 0.52, y: 0.49 } },
} as const;

/** The ship's picture for a light or a dark page: its files at 1x and 2x, its size at 1x and where her lights are. */
export function nemoShip(night: boolean) {
  const id = night ? "night" : "day";
  const at = (width: number) => `/eggs/nautilus-${id}-${width}.webp`;
  return { src: at(420), srcset: `${at(420)} 1x, ${at(840)} 2x`, width: 420, height: NEMO_SHIPS[id].height, light: NEMO_SHIPS[id].light };
}
