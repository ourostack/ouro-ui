import type { JSX } from "react";
import { Lightbox, type LightboxImage } from "@/registry/ouro/components/ouro/lightbox/lightbox";

// The live demo at the top of docs/lightbox/: the component as an app would use it, with its props, nothing else.

/** A landscape drawn inline, so the demo needs no image files. */
function photo(width: number, height: number, sky: string, sun: string, land: string, water: string): string {
  const horizon = Math.round(height * 0.62);
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="${sun}" stop-opacity="0.55"/></linearGradient></defs>` +
      `<rect width="${width}" height="${height}" fill="url(#s)"/>` +
      `<circle cx="${Math.round(width * 0.68)}" cy="${Math.round(height * 0.3)}" r="${Math.round(Math.min(width, height) * 0.11)}" fill="${sun}"/>` +
      `<path d="M0 ${horizon} L${Math.round(width * 0.22)} ${Math.round(height * 0.36)} L${Math.round(width * 0.42)} ${horizon} L${Math.round(width * 0.6)} ${Math.round(height * 0.44)} L${width} ${horizon} V${height} H0 Z" fill="${land}"/>` +
      `<rect y="${horizon}" width="${width}" height="${height - horizon}" fill="${water}" opacity="0.8"/>` +
      `</svg>`,
  )}`;
}

const coast: LightboxImage[] = [
  { src: photo(1600, 1000, "#8ec5e8", "#ffd166", "#3d7a5a", "#2f6f8f"), alt: "A green headland under a morning sun, above a calm bay", title: "Morning", caption: "The bay from the north path." },
  { src: photo(900, 1200, "#f4a261", "#ffe8a3", "#6b4f3a", "#4a6c8c"), alt: "Tall cliffs at noon over a harbour", title: "Noon" },
  { src: photo(1800, 800, "#e76f51", "#f4d35e", "#2a3d45", "#264653"), alt: "A long ridge against an orange evening sky", title: "Evening" },
  { src: photo(1000, 1000, "#1d3557", "#f1faee", "#16262e", "#1b4965"), alt: "The coast at night under a full moon", title: "Night" },
];

export default function LightboxDemo(): JSX.Element {
  return (
    <div className="w-full max-w-md">
      <Lightbox label="Coast photos" images={coast} />
    </div>
  );
}
