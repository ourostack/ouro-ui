import { SkipLink } from "@/components/ouro/skip-link/skip-link";

// expect: data-ouro="skip-link"
// expect: href="#ouro-skip-link-target"
// expect: Ouro skip link
export default function SkipLinkSection() {
  return (
    <>
      <SkipLink target="ouro-skip-link-target">Ouro skip link</SkipLink>
      <div id="ouro-skip-link-target" />
    </>
  );
}
