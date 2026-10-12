import { ScrollArea } from "@/components/ouro/scroll-area/scroll-area";

// expect: Ouro scroll area
// expect: aria-label="Server scroll area"
export default function ScrollAreaSection() {
  return (
    <ScrollArea className="h-20" label="Server scroll area">
      <p>Ouro scroll area</p>
    </ScrollArea>
  );
}
