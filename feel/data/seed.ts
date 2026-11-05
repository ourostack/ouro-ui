// Seeded, made-up data for Ouro Feel's cases: the same seed gives the same data on every run and
// every engine, and nothing comes from a real account.

/** A small, fast PRNG (mulberry32): the same seed gives the same sequence everywhere. */
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One made-up chat message. */
export interface FeelMessage {
  id: string;
  role: "user" | "assistant";
  name: string;
  /** "9:41 AM", from the message's place in the history. */
  time: string;
  text: string;
}

const people = ["Ana Lind", "Rui Okafor", "Mira Sato", "Joel Haddad", "Ines Varga"];
const agents = ["inbox-agent", "calendar-agent", "notes-agent", "travel-agent"];
const words = (
  "the a plan draft note list room week time table call page team park lunch train bread oven map trip " +
  "review send move check share open close start finish build test write read update order book " +
  "quick later today soon early small long fresh clear warm green blue quiet busy ready " +
  "and but so then also maybe still just again first next last"
).split(" ");

function pick<T>(next: () => number, from: readonly T[]): T {
  return from[Math.floor(next() * from.length)]!;
}

function sentence(next: () => number): string {
  const length = 4 + Math.floor(next() * 14);
  const text = Array.from({ length }, () => pick(next, words)).join(" ");
  return `${text[0]!.toUpperCase()}${text.slice(1)}.`;
}

/**
 * A conversation of `count` messages, oldest first, numbered from `first`. Lengths vary as a real
 * chat's do: mostly a line or two, some paragraphs, a few long answers.
 */
export function conversation(seed: number, count: number, first = 0): FeelMessage[] {
  const cast = random(seed);
  const person = pick(cast, people);
  const agent = pick(cast, agents);
  const next = random(seed * 100_003 + first);
  return Array.from({ length: count }, (_, index) => {
    const n = first + index;
    const role = next() < 0.5 ? "user" : "assistant";
    const roll = next();
    const sentences = roll < 0.6 ? 1 + Math.floor(next() * 2) : roll < 0.9 ? 3 + Math.floor(next() * 4) : 8 + Math.floor(next() * 10);
    const minutes = 8 * 60 + n * 3;
    const hour = Math.floor(minutes / 60) % 12 || 12;
    return {
      id: `m${n}`,
      role,
      name: role === "user" ? person : agent,
      time: `${hour}:${String(minutes % 60).padStart(2, "0")} ${Math.floor(minutes / 60) % 24 < 12 ? "AM" : "PM"}`,
      text: Array.from({ length: sentences }, () => sentence(next)).join(" "),
    };
  });
}
