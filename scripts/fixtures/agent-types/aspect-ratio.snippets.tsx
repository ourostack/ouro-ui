// What agents write with aspect-ratio: snippets whose cases are in aspect-ratio.cases.ts.
import { AspectRatio } from "@/registry/ouro/components/ouro/aspect-ratio/aspect-ratio";

export const aspectRatio01 = <AspectRatio ratio="16:9"><img src="/a.jpg" alt="" /></AspectRatio>;
export const aspectRatio02 = <AspectRatio ratio={1} aspectRatio={1.5}><img src="/a.jpg" alt="" /></AspectRatio>;
export const aspectRatio03 = <AspectRatio ratio={16 / 9} fit="contain"><img src="/a.jpg" alt="" /></AspectRatio>;
