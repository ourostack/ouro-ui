// What agents write with carousel: snippets whose cases are in carousel.cases.ts.
import { Carousel } from "@/registry/ouro/components/ouro/carousel/carousel";
import { setOpen } from "./helpers.ts";

export const carousel01 = <Carousel label="Photos" opts={{ loop: true }}><p>One</p><p>Two</p></Carousel>;
export const carousel02 = <Carousel><p>One</p><p>Two</p></Carousel>;
export const carousel03 = <Carousel label="Photos" setApi={setOpen}><p>One</p><p>Two</p></Carousel>;
export const carousel04 = <Carousel label="Photos" orientation="vertical"><p>One</p><p>Two</p></Carousel>;
export const carousel05 = <Carousel label="Photos" slidesPerView={4}><p>One</p><p>Two</p></Carousel>;
export const carouselOk01 = <Carousel label="Photos" loop slidesPerView={2} defaultIndex={1} previousLabel="Back" nextLabel="Forward" slideLabel="Photo {n} of {total}" className="max-w-xl"><p>One</p><p>Two</p><p>Three</p></Carousel>;
