import { ShowMore } from "@/components/ouro/collapsible/show-more";

// expect: Ouro show more item 1
// expect: Ouro show more item 2
// expect: Show more
// expect: Ouro show more text
export default function ShowMoreSection() {
  return (
    <>
      <ShowMore initialCount={2} items={["Ouro show more item 1", "Ouro show more item 2", "Ouro show more item 3"]} />
      <ShowMore lines={2}>Ouro show more text</ShowMore>
    </>
  );
}
