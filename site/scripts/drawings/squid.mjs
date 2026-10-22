// Draws site/src/nautilus/art/squid.svg, the squid at the porthole in Chapter III, from Verne's
// description (manifest.json quotes it): a spindle body with fins at the tail, a great staring eye,
// a parrot's beak, and eight arms twice as long as the body, twisted like the furies' hair. Each
// arm is a tapering band around a centre line of cubic curves, sampled and offset, so the drawing
// stays engraved line and flat fill that the theme colours.
//
//   node site/scripts/drawings/squid.mjs    rewrites the drawing; then node site/scripts/art.mts --write
import { writeFileSync } from "node:fs";
import { URL } from "node:url";

const round = (value) => Math.round(value * 10) / 10;

/** A point on a chain of cubic curves, t from 0 to 1 over the whole chain. */
function at(chain, t) {
  const count = chain.length;
  const scaled = Math.min(t * count, count - 1e-9);
  const index = Math.floor(scaled);
  const u = scaled - index;
  const [p0, p1, p2, p3] = chain[index];
  const v = 1 - u;
  const point = [0, 1].map((axis) => v * v * v * p0[axis] + 3 * v * v * u * p1[axis] + 3 * v * u * u * p2[axis] + u * u * u * p3[axis]);
  const tangent = [0, 1].map((axis) => 3 * v * v * (p1[axis] - p0[axis]) + 6 * v * u * (p2[axis] - p1[axis]) + 3 * u * u * (p3[axis] - p2[axis]));
  return { point, tangent };
}

/** A tapering band around a chain of cubic curves, from `base` wide to a point. */
function band(chain, base, samples = 48) {
  const left = [];
  const right = [];
  for (let step = 0; step <= samples; step++) {
    const t = step / samples;
    const { point, tangent } = at(chain, t);
    const length = Math.hypot(tangent[0], tangent[1]) || 1;
    const normal = [-tangent[1] / length, tangent[0] / length];
    const half = (base / 2) * (1 - t) ** 0.8 + 0.4;
    left.push([point[0] + normal[0] * half, point[1] + normal[1] * half]);
    right.push([point[0] - normal[0] * half, point[1] - normal[1] * half]);
  }
  const points = [...left, ...right.reverse()];
  return `M${points.map(([x, y]) => `${round(x)} ${round(y)}`).join(" L")} Z`;
}

/** Sucker dots along one side of a chain, shrinking toward the tip. */
function suckers(chain, from, to, count, side, size) {
  const dots = [];
  for (let index = 0; index < count; index++) {
    const t = from + ((to - from) * index) / (count - 1);
    const { point, tangent } = at(chain, t);
    const length = Math.hypot(tangent[0], tangent[1]) || 1;
    const normal = [-tangent[1] / length, tangent[0] / length];
    const r = size * (1 - t) + 0.8;
    const offset = side * (r + 1.2);
    dots.push(`<circle cx="${round(point[0] + normal[0] * offset)}" cy="${round(point[1] + normal[1] * offset)}" r="${round(r)}" />`);
  }
  return dots.join("");
}

// Where the arms leave the head, and how each one twists away (cubic segments, end to end).
const arms = [
  [[[232, 214], [214, 252], [252, 286], [222, 322]], [[222, 322], [196, 356], [176, 372], [146, 404]]],
  [[[224, 208], [192, 236], [204, 282], [164, 300]], [[164, 300], [124, 318], [100, 336], [82, 384]]],
  [[[218, 202], [182, 206], [162, 246], [122, 244]], [[122, 244], [82, 242], [58, 262], [28, 296]]],
  [[[220, 196], [192, 182], [152, 194], [122, 176]], [[122, 176], [92, 158], [60, 150], [16, 168]]],
  [[[242, 220], [246, 262], [292, 300], [280, 348]], [[280, 348], [272, 380], [298, 398], [318, 424]]],
  [[[236, 218], [230, 262], [196, 290], [206, 334]], [[206, 334], [214, 368], [242, 382], [236, 420]]],
  [[[252, 214], [282, 246], [330, 250], [352, 290]], [[352, 290], [370, 322], [392, 330], [420, 330]]],
];
// The arm laid against the glass, in front of the rest, its suckers turned to us.
const glass = [[[226, 206], [196, 214], [150, 196], [128, 226]], [[128, 226], [106, 256], [150, 286], [124, 304]], [[124, 304], [104, 318], [86, 300], [98, 288]]];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
  <title>A giant squid at the porthole</title>
  <!-- Original drawing for Ouro HX after Verne alone (manifest.json): Chapter III's encounter,
       seen through the Nautilus's glass. A spindle body with fins at its tail, the head with one
       great staring eye and a parrot's beak, eight arms twice as long as the body, twisting away,
       and one laid against the glass with its suckers turned to us. Drawn by
       site/scripts/drawings/squid.mjs; its colours come from the theme (chapters.css), but for the
       pupil, the glint and the beak, which keep their own; and
       the page moves its parts as the fight goes (sq-glass-arm lets go, the whole squid swims off
       behind its ink). -->
  <g class="sq-ink" stroke="none">
    <path d="M300 120 C250 90 200 120 210 170 C170 190 180 250 230 250 C250 290 320 280 330 240 C380 240 390 170 350 160 C360 120 330 100 300 120 Z" />
    <circle cx="190" cy="120" r="22" />
    <circle cx="360" cy="270" r="26" />
  </g>
  <g class="sq-squid">
    <g class="sq-arms" stroke-width="1.3">
${arms.map((chain, index) => `      <path class="sq-arm" data-arm="${index + 1}" d="${band(chain, 15)}" />`).join("\n")}
    </g>
    <g class="sq-body" stroke-width="1.6">
      <path class="sq-fin" d="M372 22 C352 6 334 -6 318 -10 C338 12 352 26 362 34 Z M398 56 C414 72 430 80 446 82 C430 62 416 48 404 42 Z" />
      <path class="sq-mantle" d="M256 176 C268 124 330 56 412 -6 L436 -14 C432 20 384 104 292 192 C280 202 262 198 256 176 Z" />
      <path class="sq-marks" d="M300 120 C318 96 346 62 380 32 M314 140 C334 114 364 80 398 50" stroke-width="1" stroke-dasharray="2 5" />
      <ellipse class="sq-head" cx="244" cy="190" rx="30" ry="24" transform="rotate(-38 244 190)" />
      <circle class="sq-eye" cx="252" cy="178" r="15" />
      <circle class="sq-pupil" cx="248" cy="181" r="6.5" stroke="none" fill="#141a22" />
      <circle class="sq-glint" cx="245" cy="177" r="2.2" stroke="none" fill="white" />
      <path class="sq-beak" d="M218 204 L232 212 L216 218 Z" stroke-width="1.4" fill="#3b2a22" />
    </g>
    <g class="sq-glass-arm" stroke-width="1.5">
      <path class="sq-arm" d="${band(glass, 20, 72)}" />
      <g class="sq-suckers" stroke-width="1">${suckers(glass, 0.12, 0.92, 15, 1, 3.4)}</g>
    </g>
  </g>
</svg>
`;
writeFileSync(new URL("../../src/nautilus/art/squid.svg", import.meta.url), svg);
console.log(`squid.svg: ${svg.length} bytes`);
