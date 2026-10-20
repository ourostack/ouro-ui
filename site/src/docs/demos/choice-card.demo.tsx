import { type JSX } from "react";
import { ChoiceCard } from "@/registry/ouro/components/ouro/choice-card/choice-card";

// The live demo at the top of docs/choice-card/: the component as an app would use it, with its props, nothing else.

const swatch = (from: string, to: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="160" height="120" fill="url(#g)"/></svg>`)}`;

export default function ChoiceCardDemo(): JSX.Element {
  return (
    <ChoiceCard
      legend="Theme"
      name="theme"
      defaultValue="sea"
      className="max-w-xl"
      items={[
        { value: "sand", label: "Sand", description: "Warm", media: <img src={swatch("#f6d365", "#fda085")} alt="" /> },
        { value: "sea", label: "Sea", description: "Cool", media: <img src={swatch("#89f7fe", "#66a6ff")} alt="" /> },
        { value: "night", label: "Night", description: "Dark", media: <img src={swatch("#a18cd1", "#3b2667")} alt="" /> },
      ]}
    />
  );
}
