/**
 * The voyage page's overlays, HX Inspector and the Toaster, in one chunk that loads after the first paint
 * (site/src/pages/voyage.tsx). One chunk, not two: loaded on its own, the Toaster's chunk led the bundler to split
 * Base UI's popup store out of the chunk the docs share, which grew every docs page's first script.
 */
export { Inspector } from "@/registry/ouro/components/ouro/inspector/inspector";
export { Toaster } from "@/registry/ouro/components/ouro/toast/toaster";
