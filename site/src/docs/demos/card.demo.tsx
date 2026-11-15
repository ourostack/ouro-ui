import { type JSX } from "react";
import { AspectRatio } from "@/registry/ouro/components/ouro/aspect-ratio/aspect-ratio";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Card } from "@/registry/ouro/components/ouro/card/card";
import { Text } from "@/registry/ouro/components/ouro/text/text";

const braise = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#7c2d12"/><circle cx="8" cy="5" r="3.2" fill="#fdba74"/><circle cx="8" cy="5" r="2" fill="#c2410c"/></svg>')}`;

// The live demo at the top of docs/card/: the component as an app would use it, with its props, nothing else.

export default function CardDemo(): JSX.Element {
  return (
    <div className="grid w-full max-w-md gap-4">
      <Card headingLevel={2} title="Pantry" description="What you have on hand" action={<Button variant="outline" size="sm">Edit</Button>}>
        <Text>Flour, rice, black beans, two lemons.</Text>
      </Card>
      <Card headingLevel={2} href="#weeknight-dinners" title="Weeknight dinners" description="12 recipes" size="sm" />
      <Card
        headingLevel={2}
        href="#braising"
        media={
          <AspectRatio ratio={16 / 9}>
            <img src={braise} alt="" />
          </AspectRatio>
        }
        title="Braising"
        description="Low heat, a lid, and time"
        size="sm"
        zoomMedia
        revealDescription
      />
    </div>
  );
}
