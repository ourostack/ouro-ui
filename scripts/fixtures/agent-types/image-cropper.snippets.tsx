// What agents write with image-cropper: snippets whose cases are in image-cropper.cases.ts.
import { ImageCropper } from "@/registry/ouro/components/ouro/image-cropper/image-cropper";

const file = new File([], "photo.png");

export const imageCropper01 = <ImageCropper open onOpenChange={() => {}} image={file} onCrop={() => {}} aspectRatio={1} />;
export const imageCropperOk01 = <ImageCropper open onOpenChange={() => {}} image={file} onCrop={() => {}} aspect={16 / 9} shape="rect" outputWidth={800} type="image/webp" title="Crop cover" />;
