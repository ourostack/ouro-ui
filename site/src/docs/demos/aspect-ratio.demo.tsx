import { type JSX } from "react";
import { AspectRatio } from "@/registry/ouro/components/ouro/aspect-ratio/aspect-ratio";

// The live demo at the top of docs/aspect-ratio/: the component as an app would use it, with its props, nothing else.

const photo = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#f59e0b"/><stop offset="1" stop-color="#7c2d12"/></linearGradient></defs><rect width="3" height="2" fill="url(#g)"/><circle cx="1.5" cy="1" r=".6" fill="#fff" fill-opacity=".85"/></svg>',
)}`;

export default function AspectRatioDemo(): JSX.Element {
  return (
    <div className="w-full max-w-md">
      <AspectRatio ratio={16 / 9}>
        <img src={photo} alt="Short ribs in a dark pot" />
      </AspectRatio>
    </div>
  );
}
