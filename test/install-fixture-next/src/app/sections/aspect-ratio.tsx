import { AspectRatio } from "@/components/ouro/aspect-ratio/aspect-ratio";

// expect: Ouro aspect ratio
// expect: aspect-ratio:1.5
export default function AspectRatioSection() {
  return (
    <AspectRatio ratio={1.5}>
      <div>Ouro aspect ratio</div>
    </AspectRatio>
  );
}
