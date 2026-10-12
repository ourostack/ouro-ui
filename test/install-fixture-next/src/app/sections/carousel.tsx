import { Carousel } from "@/components/ouro/carousel/carousel";

// expect: data-ouro="carousel"
// expect: aria-roledescription="carousel"
// expect: aria-label="Slide 2 of 3"
// expect: aria-label="Next slide"
export default function CarouselSection() {
  return (
    <Carousel label="Recipe photos" loop>
      <p>Shakshuka</p>
      <p>Short ribs</p>
      <p>Lemon tart</p>
    </Carousel>
  );
}
