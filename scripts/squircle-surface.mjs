const N = 8;
const f = (v) => +v.toFixed(4);
const curve = Array.from({ length: N + 1 }, (_, k) => {
  const th = ((Math.PI / 2) * k) / N;
  return [1 - Math.sqrt(Math.cos(th)), 1 - Math.sqrt(Math.sin(th))];
});
const mul = (r, a) => `${r}*${f(a)}`;

/** Points of a squircle (superellipse, exponent 4) box inset by `i` with corner size `r`, as CSS lengths. */
export function squirclePoints(i, r) {
  const L = i;
  const T = i;
  const Rt = `100% - ${i}`;
  const B = `100% - ${i}`;
  const p = [];
  for (const [a, b] of curve) p.push([`calc(${L} + ${mul(r, a)})`, `calc(${T} + ${mul(r, b)})`]);
  for (const [a, b] of curve) p.push([`calc(${Rt} - ${mul(r, b)})`, `calc(${T} + ${mul(r, a)})`]);
  for (const [a, b] of curve) p.push([`calc(${Rt} - ${mul(r, a)})`, `calc(${B} - ${mul(r, b)})`]);
  for (const [a, b] of curve) p.push([`calc(${L} + ${mul(r, b)})`, `calc(${B} - ${mul(r, a)})`]);
  return p;
}

const fmt = (pts) => pts.map((q) => q.join(" ")).join(", ");

/** clip-path for the filled squircle of corner size `r` (default the surface's own `--ouro-sq-r`). */
export function surfacePath(r = "var(--ouro-sq-r)") {
  return `polygon(${fmt(squirclePoints("0px", r))})`;
}

/** clip-path for the ring `w` wide inside that squircle. */
export function ringPath(r = "var(--ouro-sq-r)", w = "var(--ouro-sq-w)") {
  const inner = squirclePoints(w, `max(0px, calc(${r} - ${w}))`);
  const outer = squirclePoints("0px", r);
  // One polygon cannot hold two shapes, so the inner one hangs off a zero-width bridge from the outer's first point.
  return `polygon(evenodd, ${fmt([...outer, outer[0], ...inner, inner[0], outer[0]])})`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`surface: ${surfacePath()}\nring: ${ringPath()}`);
}
