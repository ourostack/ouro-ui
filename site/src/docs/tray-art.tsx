import type { JSX } from "react";

// Made-up placeholder art: plain shapes in currentColor, which a Moment colours by its kind, shared by the Moment demo and the chat demo.

export function TrayArt(): JSX.Element {
  return (
    <svg viewBox="30 8 140 140" fill="none">
      <ellipse cx="100" cy="136" rx="62" ry="6" fill="currentColor" opacity="0.12" />
      <circle cx="100" cy="30" r="12" className="fill-primary">
        <animateTransform attributeName="transform" type="translate" values="0 0; 0 -4; 0 0" dur="4s" repeatCount="indefinite" />
      </circle>
      <circle cx="132" cy="20" r="3" className="fill-primary" opacity="0.45" />
      <circle cx="68" cy="42" r="2" fill="currentColor" opacity="0.4" />
      <path d="M46 78 100 58l54 20-54 20Z" fill="currentColor" opacity="0.1" />
      <path d="M46 78 100 98v32l-54-22Z" fill="currentColor" opacity="0.28" />
      <path d="M154 78 100 98v32l54-22Z" fill="currentColor" opacity="0.42" />
    </svg>
  );
}
