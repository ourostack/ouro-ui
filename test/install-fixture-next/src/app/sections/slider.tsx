import { Slider } from "@/components/ouro/slider/slider";

// expect: Ouro slider
// expect: Ouro range slider
// expect: aria-label="Minimum, Ouro range slider"
// A range's group is named by the visible label, in the server HTML.
// expect: aria-labelledby="[^"]*-label"[^>]*role="group"
export default function SliderSection() {
  return (
    <>
      <Slider label="Ouro slider" name="volume" defaultValue={40} showValue />
      <Slider label="Ouro range slider" name="price" defaultValue={[10, 40]} max={60} showValue />
    </>
  );
}
