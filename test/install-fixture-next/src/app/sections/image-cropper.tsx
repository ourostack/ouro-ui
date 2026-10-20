import { ImageCropper } from "@/components/ouro/image-cropper/image-cropper";

async function openChange(open: boolean) {
  "use server";
  void open;
}

async function saveCrop(file: File) {
  "use server";
  void file;
}

// expect: data-ouro-section="image-cropper"
export default function ImageCropperSection() {
  return (
    <div data-ouro-section="image-cropper">
      <ImageCropper open={false} onOpenChange={openChange} image={null} onCrop={saveCrop} />
    </div>
  );
}
