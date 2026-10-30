import { Lightbox } from "@/components/ouro/lightbox/lightbox";

// expect: data-ouro="lightbox"
// expect: aria-label="Kitchen photos"
// expect: aria-haspopup="dialog"
// expect: alt="The new kitchen, with white cabinets"
export default function LightboxSection() {
  return (
    <Lightbox
      label="Kitchen photos"
      images={[
        { src: "/before.jpg", alt: "The old kitchen, with dark cabinets", title: "Before" },
        { src: "/after.jpg", alt: "The new kitchen, with white cabinets", title: "After" },
      ]}
    />
  );
}
