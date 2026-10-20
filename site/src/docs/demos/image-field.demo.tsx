import { type JSX } from "react";
import { ImageField } from "@/registry/ouro/components/ouro/image-field/image-field";

// The live demo at the top of docs/image-field/: the component as an app would use it, with its props, nothing else.

export default function ImageFieldDemo(): JSX.Element {
  return <ImageField label="Profile photo" description="PNG or JPG, up to 5 MB." name="photo" shape="circle" crop={{ outputWidth: 512 }} maxSize={5 * 1024 * 1024} />;
}
