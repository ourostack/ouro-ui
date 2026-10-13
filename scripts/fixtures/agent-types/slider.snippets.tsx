// What agents write with slider: snippets whose cases are in slider.cases.ts.
import { Slider } from "@/registry/ouro/components/ouro/slider/slider";

export const slider01 = <Slider label="Price" range defaultValue={[20, 80]} />;
export const slider02 = <Slider label="Volume" valueLabelDisplay="auto" />;
export const slider03 = <Slider label="Volume" required />;
export const slider04 = <Slider label="Volume" onChange={() => {}} />;
export const sliderOk01 = <Slider label="Price" name="price" defaultValue={[10, 40]} min={0} max={60} showValue format={{ style: "currency", currency: "USD" }} />;
