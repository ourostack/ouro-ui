/** A width and a height in pixels. */
export interface Size {
  width: number;
  height: number;
}

/** How far the image's centre sits from the frame's, in screen pixels. */
export interface Offset {
  x: number;
  y: number;
}

/** The scale at which the image just covers the frame. */
export function coverScale(image: Size, frame: Size): number {
  return Math.max(frame.width / image.width, frame.height / image.height);
}

/** An offset kept within the image's edges, so the frame never shows past them. */
export function clampOffset(image: Size, frame: Size, scale: number, offset: Offset): Offset {
  const spareX = Math.max(0, (image.width * scale - frame.width) / 2);
  const spareY = Math.max(0, (image.height * scale - frame.height) / 2);
  return { x: Math.min(spareX, Math.max(-spareX, offset.x)), y: Math.min(spareY, Math.max(-spareY, offset.y)) };
}

/** The part of the image the frame shows, in the image's own pixels. */
export function cropRect(image: Size, frame: Size, scale: number, offset: Offset): { x: number; y: number; width: number; height: number } {
  const width = frame.width / scale;
  const height = frame.height / scale;
  return {
    x: image.width / 2 - offset.x / scale - width / 2,
    y: image.height / 2 - offset.y / scale - height / 2,
    width,
    height,
  };
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
/** Pixels an arrow key moves the image; ten times as far with Shift. */
export const STEP = 10;
