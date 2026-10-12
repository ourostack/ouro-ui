import type { JSX } from "react";
import { Carousel } from "@/registry/ouro/components/ouro/carousel/carousel";

// The live demo at the top of docs/carousel/: the component as an app would use it, with its props, nothing else.

const dishes = ["Shakshuka", "Short ribs", "Lemon tart", "Green curry", "Focaccia"];

export default function CarouselDemo(): JSX.Element {
  return (
    <div className="w-full max-w-md">
      <Carousel label="Featured recipes">
        {dishes.map((dish) => (
          <div key={dish} className="grid h-40 place-items-center rounded-lg border border-border bg-muted text-lg font-medium">
            {dish}
          </div>
        ))}
      </Carousel>
    </div>
  );
}
