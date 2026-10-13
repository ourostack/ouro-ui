import { Breadcrumb } from "@/components/ouro/breadcrumb/breadcrumb";

// expect: data-ouro="breadcrumb"
// expect: aria-label="Ouro breadcrumb"
// expect: href="/breadcrumb-recipes"
// The last item is the current page, in the server HTML.
// expect: aria-current="page"[^>]*>Ouro breadcrumb page<
// A long trail's middle is behind a menu button.
// expect: aria-label="More"
export default function BreadcrumbSection() {
  return (
    <>
      <Breadcrumb
        label="Ouro breadcrumb"
        items={[{ label: "Ouro breadcrumb home", href: "/" }, { label: "Ouro breadcrumb recipes", href: "/breadcrumb-recipes" }, { label: "Ouro breadcrumb page" }]}
      />
      <Breadcrumb
        label="Ouro long breadcrumb"
        items={[
          { label: "One", href: "/1" },
          { label: "Two", href: "/2" },
          { label: "Three", href: "/3" },
          { label: "Four", href: "/4" },
          { label: "Five" },
        ]}
      />
    </>
  );
}
