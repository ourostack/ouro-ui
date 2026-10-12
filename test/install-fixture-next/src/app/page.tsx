import { sections } from "./sections";

// Every component, rendered by a Server Component: one section per component in
// sections/<item>.tsx. scripts/install-test.sh writes sections/index.ts from those files.
export default function Page() {
  return (
    <main>
      {sections.map(({ name, Section }) => (
        <Section key={name} />
      ))}
    </main>
  );
}
