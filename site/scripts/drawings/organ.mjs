// Draws site/src/nautilus/art/organ.svg, Captain Nemo's organ for Chapter III's payoff: a case of
// pipes over a console and its keys, and the notes it plays, which the page sends up when Nemo
// plays (chapter-three.css). The book calls it a "piano-organ" in the saloon; the pipes are drawn
// for a child to see it is an organ at once.
//
//   node site/scripts/drawings/organ.mjs    rewrites the drawing; then node site/scripts/art.mts --write
import { writeFileSync } from "node:fs";

const pipes = [];
const heights = [70, 86, 102, 118, 132, 118, 102, 86, 70];
heights.forEach((height, index) => {
  const x = 46 + index * 18;
  const top = 150 - height;
  pipes.push(`<path d="M${x} 150 V${top + 6} Q${x} ${top} ${x + 6} ${top} Q${x + 12} ${top} ${x + 12} ${top + 6} V150" />`);
  pipes.push(`<path class="or-mouth" d="M${x + 3} ${150 - Math.round(height * 0.22)} h6 l-3 -5 z" />`);
});
const keys = [];
for (let index = 0; index < 14; index++) keys.push(`<path d="M${52 + index * 11} 178 V196" />`);
const blacks = [];
for (const index of [0, 1, 3, 4, 5, 7, 8, 10, 11, 12]) blacks.push(`<rect x="${59 + index * 11}" y="178" width="5" height="10" rx="1" />`);

// A note: a filled head and a stem, some with a flag; each rises and fades on its own path.
const note = (x, y, flag, index) =>
  `<g class="or-note" data-note="${index}" transform="translate(${x} ${y})"><ellipse cx="0" cy="0" rx="5.4" ry="4" transform="rotate(-20)" /><path d="M5 -1 V-22${flag ? " C10 -18 14 -15 12 -8" : ""}" fill="none" /></g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -40 260 250" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
  <title>Captain Nemo's organ</title>
  <!-- Original drawing for Ouro HX (manifest.json): the organ in the Nautilus's saloon, which
       Captain Nemo plays at the end of Chapter III. A case of pipes, tallest in the middle, over a
       console with its keys; the notes over it rise when he plays. Engraved lines and flat fills;
       colour comes from the theme. -->
  <g class="or-notes" fill="currentColor" stroke-width="1.6">
    ${[note(60, 22, true, 1), note(94, 4, false, 2), note(130, -12, true, 3), note(166, 2, false, 4), note(200, 20, true, 5)].join("\n    ")}
  </g>
  <g class="or-case" stroke-width="1.5">
    <path class="or-fill" d="M36 152 V60 Q36 42 54 36 L130 14 L206 36 Q224 42 224 60 V152 Z" />
    <path d="M36 152 V60 Q36 42 54 36 L130 14 L206 36 Q224 42 224 60 V152" />
  </g>
  <g class="or-pipes" stroke-width="1.4">
    ${pipes.join("\n    ")}
  </g>
  <g class="or-console" stroke-width="1.5">
    <path class="or-fill" d="M28 152 H232 V170 H28 Z" />
    <path d="M40 170 V200 M220 170 V200 M40 200 H220" />
    <path class="or-keys-bed" d="M48 176 H212 V198 H48 Z" />
    <g class="or-keys" stroke-width="0.9">${keys.join("")}</g>
    <g class="or-black" fill="currentColor" stroke="none">${blacks.join("")}</g>
  </g>
</svg>
`;
writeFileSync(new URL("../../src/nautilus/art/organ.svg", import.meta.url), svg);
console.log(`organ.svg: ${svg.length} bytes`);
