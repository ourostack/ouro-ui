import { ImageField } from "@/components/ouro/image-field/image-field";

// expect: data-ouro="image-field"
// expect: Ouro image field
// expect: Choose photo
export default function ImageFieldSection() {
  return <ImageField label="Ouro image field" name="ouro-photo" crop />;
}
