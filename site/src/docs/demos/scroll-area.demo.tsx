import { type JSX } from "react";
import { ScrollArea } from "@/registry/ouro/components/ouro/scroll-area/scroll-area";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/scroll-area/: the component as an app would use it, with its props, nothing else.

const steps = [
  "Pat the short ribs dry and season them well.",
  "Sear them hard on every side, in batches.",
  "Soften onion, carrot and celery in the fat.",
  "Stir in tomato paste until it darkens.",
  "Pour in the wine and scrape up the browned bits.",
  "Add stock to come halfway up the ribs.",
  "Cover and braise at 160°C for three hours.",
  "Rest overnight, then lift off the fat.",
];

export default function ScrollAreaDemo(): JSX.Element {
  return (
    <ScrollArea className="h-48 w-full max-w-md" label="Method">
      <div className="grid gap-3 pe-3">
        {steps.map((step, index) => (
          <Text key={step}>
            {index + 1}. {step}
          </Text>
        ))}
      </div>
    </ScrollArea>
  );
}
