import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { MediaTile, type MediaTileProps } from "@/registry/ouro/components/ouro/media-tile/media-tile";
import { mediaTileAx } from "@/registry/ouro/components/ouro/media-tile/media-tile-styles";

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

expectTypeOf<{ name: "Mara Lind" }>().toExtend<MediaTileProps>();
expectTypeOf<{
  name: "Mara Lind";
  cameraOn: false;
  source: "screen";
  fit: "contain";
  avatar: { src: "/mara.jpg"; idForColor: "u-17"; size: "lg" };
  muted: true;
  handRaised: true;
  connection: "poor";
  paused: "video paused to save power";
  speaking: true;
  hysteresis: { on: 200; off: 800 };
  ring: false;
  pinned: true;
  onPinnedChange: (pinned: boolean) => void;
  presenting: true;
  onVisibilityChange: (visible: boolean, width: number, height: number) => void;
  labels: { speaking: "spricht" };
  className: "aspect-square";
  id: "tile-mara";
  onContextMenu: () => void;
}>().toExtend<MediaTileProps>();
expectTypeOf<ComponentProps<typeof MediaTile>>().toEqualTypeOf<MediaTileProps>();

// The name is required; the guessed names are hint types; speaking is on or off.
expectTypeOf<{ speaking: true }>().not.toExtend<MediaTileProps>();
expectTypeOf<{ name: "Mara Lind"; speaking: 0.6 }>().not.toExtend<MediaTileProps>();
expectTypeOf<{ name: "Mara Lind"; level: 0.6 }>().not.toExtend<MediaTileProps>();
expectTypeOf<{ name: "Mara Lind"; isMuted: true }>().not.toExtend<MediaTileProps>();
expectTypeOf<{ name: "Mara Lind"; label: "Mara Lind" }>().not.toExtend<MediaTileProps>();
expectTypeOf<{ name: "Mara Lind"; objectFit: "contain" }>().not.toExtend<MediaTileProps>();
expectTypeOf<{ name: "Mara Lind"; src: "/mara.jpg" }>().not.toExtend<MediaTileProps>();
expectTypeOf<{ name: "Mara Lind"; connection: "bad" }>().not.toExtend<MediaTileProps>();
expectTypeOf<{ name: "Mara Lind"; fit: "fill" }>().not.toExtend<MediaTileProps>();
expectTypeOf<{ name: "Mara Lind"; source: "window" }>().not.toExtend<MediaTileProps>();
// The photo takes its name from the tile.
expectTypeOf<{ name: "Mara Lind"; avatar: { name: "Mara" } }>().not.toExtend<MediaTileProps>();
// @ts-expect-error name is required.
createElement(MediaTile, { speaking: true });

// The agent side, as literal types for Ouro AX's kit: every action has an effect and agent: true.
expectTypeOf(mediaTileAx.component).toEqualTypeOf<"MediaTile">();
expectTypeOf(mediaTileAx.reads[0]).toEqualTypeOf<{
  readonly id: "participant";
  readonly summary: "Who is in the tile, and what they are doing.";
  readonly fields: readonly ["name", "muted", "camera", "speaking", "handRaised", "connection"];
  readonly consent: "none";
}>();
expectTypeOf(mediaTileAx.actions[0]).toEqualTypeOf<{ readonly id: "pin"; readonly summary: "Keep this tile in the person's main view."; readonly effect: "private"; readonly agent: true }>();
