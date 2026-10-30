// What agents write with lightbox: snippets whose cases are in lightbox.cases.ts.
import { Lightbox } from "@/registry/ouro/components/ouro/lightbox/lightbox";

const photos = [{ src: "/photos/before.jpg", alt: "The old kitchen" }];

export const lightbox01 = <Lightbox label="Photos" images={photos} slides={photos} />;
export const lightbox02 = <Lightbox images={photos} />;
export const lightboxOk01 = <Lightbox label="Photos" images={[{ src: "/a.jpg", alt: "The old kitchen", thumbnail: "/a-small.jpg", title: "Before", caption: "Dark cabinets", href: "/a.jpg" }]} loop closeLabel="Done" previousLabel="Back" nextLabel="Forward" positionLabel="Photo {n} of {total}" originalLabel="Full size" className="max-w-2xl" />;
