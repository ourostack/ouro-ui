import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ImageCropper } from "@/registry/ouro/components/ouro/image-cropper/image-cropper";

// The live demo at the top of docs/image-cropper/: the component as an app would use it, with its props, nothing else.

const landscape = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="#9ad0ec"/><circle cx="470" cy="110" r="56" fill="#ffd166"/><path d="M0 300 L180 160 L330 300 L470 190 L640 330 V420 H0 Z" fill="#3d7a5a"/></svg>',
)}`;

export default function ImageCropperDemo(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [cropped, setCropped] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button onClick={() => setOpen(true)}>Crop the photo</Button>
      {cropped ? <img src={cropped} alt="The cropped photo" width={80} className="rounded-lg" /> : null}
      <ImageCropper open={open} onOpenChange={setOpen} image={landscape} aspect={4 / 3} outputWidth={320} onCrop={(file) => setCropped(URL.createObjectURL(file))} />
    </div>
  );
}
