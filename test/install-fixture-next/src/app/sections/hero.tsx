import { Hero } from "@/components/ouro/hero/hero";

// expect: data-ouro="hero"
// expect: Dinner, sorted
export default function HeroSection() {
  return <Hero eyebrow="Section" title="Dinner, sorted" description="Rendered on the server." />;
}
