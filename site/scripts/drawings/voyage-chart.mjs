// Draws site/src/nautilus/art/voyage-chart.svg, the chart room's engraved map, from hand-placed
// coastline points (lon, lat). Projection: x = (lon + 180) * 3, y = (65 - lat) * 2.2, so the map
// runs from 180° W to 60° E and from 65° N to the South Pole, the oceans the voyage crosses. The
// coasts are a few points each, placed by eye: a child's chart, not a survey.
//
//   node site/scripts/drawings/voyage-chart.mjs    rewrites the drawing; then node site/scripts/art.mts --write
import { writeFileSync } from "node:fs";
import { URL } from "node:url";

const X = (lon) => +((lon + 180) * 3).toFixed(1);
const Y = (lat) => +((65 - lat) * 2.2).toFixed(1);
const W = 720;
const H = 341;

const land = {
  northAmerica: [[-168, 75], [-168, 65], [-162, 60], [-157, 58], [-150, 61], [-140, 60], [-135, 57], [-130, 54], [-125, 49], [-124, 42], [-121, 35], [-117, 32], [-112, 29], [-114, 31], [-110, 23], [-105, 20], [-97, 16], [-92, 15], [-87, 13], [-83, 9], [-79, 8], [-77, 9], [-81, 12], [-84, 15], [-88, 16], [-87, 21], [-91, 19], [-97, 22], [-97, 26], [-94, 29.5], [-89, 30], [-84, 30], [-82, 26], [-80, 25], [-81, 30], [-76, 35], [-74, 40], [-70, 42], [-66, 44], [-64, 46], [-60, 46], [-55, 47], [-56, 52], [-60, 55], [-64, 60], [-70, 62], [-78, 62], [-82, 58], [-90, 57], [-94, 60], [-90, 65], [-90, 75]],
  southAmerica: [[-77, 9], [-72, 12], [-64, 11], [-60, 9], [-52, 5], [-50, 0], [-44, -2], [-35, -6], [-35, -9], [-39, -14], [-40, -21], [-45, -23], [-48, -26], [-53, -34], [-58, -38], [-62, -39], [-65, -45], [-68, -50], [-69, -52], [-67, -55], [-72, -54], [-75, -50], [-74, -44], [-72, -30], [-71, -18], [-76, -13], [-81, -6], [-80, -1], [-77, 3], [-78, 7]],
  cuba: [[-85, 22], [-80, 23], [-74, 20], [-77, 20], [-82, 21.5]],
  greenland: [[-55, 75], [-52, 66], [-44, 60], [-40, 64], [-22, 70], [-20, 75]],
  iceland: [[-24, 64], [-18, 63.5], [-14, 65], [-18, 66.5], [-22, 66]],
  britain: [[-5, 50], [1, 51], [2, 53], [-1, 55], [-2, 57], [-4, 59], [-6, 58], [-5, 55], [-3, 54], [-5, 52]],
  ireland: [[-10, 52], [-6, 52], [-6, 55], [-8, 55.3], [-10, 54]],
  eurasia: [[-9, 37], [-9, 43], [-2, 43.5], [-1, 46], [-4, 48], [2, 51], [5, 53], [8, 54], [8, 57], [10, 59], [5, 62], [8, 64], [14, 67], [20, 70], [30, 71], [40, 68], [60, 70], [60, 75], [66, 75], [66, 25], [60, 25], [57, 26], [56, 24], [59, 22], [55, 17], [52, 16], [45, 13], [43, 13], [39, 21], [35, 28], [34, 28], [32.5, 30], [35, 32], [36, 36], [30, 36.5], [27, 37], [26, 40], [23, 40], [23, 37], [21, 39], [19, 42], [13, 45], [12, 44], [16, 41], [18, 40], [16, 38], [15, 40], [12, 42], [10, 44], [7, 44], [3, 43], [0, 39], [-2, 37], [-5.5, 36]],
  africa: [[-17, 21], [-16, 15], [-17, 13], [-12, 7], [-8, 4.5], [-2, 5], [4, 6], [9, 4], [10, 1], [9, -2], [12, -6], [13, -12], [12, -18], [15, -27], [18, -34], [20, -35], [26, -34], [32, -29], [35, -24], [35, -20], [40, -15], [40, -10], [39, -5], [41, -1], [44, 2], [51, 11], [43, 12], [39, 17], [35, 26], [33, 30], [32, 31], [25, 32], [20, 31], [15, 32], [10, 34], [10, 37], [3, 37], [-6, 36], [-10, 30], [-13, 27]],
  madagascar: [[44, -25], [47, -25], [50, -15], [49, -12], [44, -17]],
  antarctica: [[-180, -72], [-150, -75], [-120, -73], [-90, -72], [-70, -66], [-60, -63], [-58, -64], [-55, -72], [-30, -76], [0, -70], [30, -69], [66, -67], [66, -95], [-180, -95]],
  hawaii: [[-156, 21], [-155, 19], [-154.8, 19.8]],
};

const path = (points) => `M${points.map(([lon, lat]) => `${X(lon)} ${Y(lat)}`).join(" L")} Z`;

const graticule = [];
for (let lon = -150; lon <= 30; lon += 30) graticule.push(`M${X(lon)} 0 V${H}`);
for (let lat = 60; lat >= -60; lat -= 30) if (lat !== 0) graticule.push(`M0 ${Y(lat)} H${W}`);


const rose = (cx, cy, r) => `
    <g class="ch-rose" transform="translate(${cx} ${cy})" opacity="0.7">
      <circle r="${r}" stroke-width="1" />
      <circle r="${r - 5}" stroke-width="0.6" stroke-dasharray="1.5 2.5" />
      <path d="M0 ${-r - 6} L4 -4 L${r + 6} 0 L4 4 L0 ${r + 6} L-4 4 L${-r - 6} 0 L-4 -4 Z" stroke-width="1.1" />
      <path d="M0 ${-r - 6} L4 -4 L0 0 Z M${r + 6} 0 L4 4 L0 0 Z M0 ${r + 6} L-4 4 L0 0 Z M${-r - 6} 0 L-4 -4 L0 0 Z" fill="currentColor" stroke="none" opacity="0.55" />
      <text y="${-r - 9}" text-anchor="middle" font-size="9" fill="currentColor" stroke="none">N</text>
    </g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
  <title>The chart room's map of the voyage</title>
  <!-- Original drawing for Ouro HX (manifest.json): an engraved chart of the seas the Nautilus
       crosses in Verne's book, from the North Pacific to the South Pole. The coasts are drawn
       freehand from a few points each (no survey data), on a plain grid inside the chart's neat line (the coasts stop at it): x = (longitude + 180) × 3,
       y = (65 − latitude) × 2.2, so the chart runs from 180° W to 60° E and from 65° N down to the
       pole. The chart room draws the route and the ports on top of it (chapter-two.tsx). Colour
       comes from the theme. -->
  <defs>
    <clipPath id="ch-neat">
      <rect x="5" y="5" width="${W - 10}" height="${H - 10}" />
    </clipPath>
  </defs>
  <rect class="ch-sea" x="0" y="0" width="${W}" height="${H}" stroke="none" />
  <g class="ch-grid" clip-path="url(#ch-neat)" stroke-width="0.6" stroke-dasharray="2 4" opacity="0.45">
    <path d="${graticule.join(" ")}" />
  </g>
  <path class="ch-line" clip-path="url(#ch-neat)" d="M0 ${Y(0)} H${W}" stroke-width="0.9" stroke-dasharray="6 4" opacity="0.55" />
  <g class="ch-land" clip-path="url(#ch-neat)" stroke-width="1.1">
${Object.entries(land)
  .map(([name, points]) => `    <path data-land="${name}" d="${path(points)}" />`)
  .join("\n")}
  </g>
  <g class="ch-labels" fill="currentColor" stroke="none" font-size="8" letter-spacing="1.5" opacity="0.45">
    <text x="${X(-150)}" y="${Y(10)}">PACIFIC OCEAN</text>
    <text x="${X(-58)}" y="${Y(36)}">NORTH ATLANTIC</text>
    <text x="${X(-32)}" y="${Y(-34)}">SOUTH ATLANTIC</text>
    <text x="${X(-58)}" y="${Y(-80)}">THE ICE</text>
    <text x="${X(-30)}" y="${Y(1.5)}" font-size="7" letter-spacing="1">THE LINE</text>
  </g>
  ${rose(X(-148), Y(-42), 18)}
  <g class="ch-frame" stroke-width="1">
    <rect x="1" y="1" width="${W - 2}" height="${H - 2}" />
    <rect x="5" y="5" width="${W - 10}" height="${H - 10}" stroke-width="0.5" />
  </g>
</svg>
`;
writeFileSync(new URL("../../src/nautilus/art/voyage-chart.svg", import.meta.url), svg);
console.log(`voyage-chart.svg: ${svg.length} bytes`);
