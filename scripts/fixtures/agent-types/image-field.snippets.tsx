// What agents write with image-field: snippets whose cases are in image-field.cases.ts.
import { ImageField } from "@/registry/ouro/components/ouro/image-field/image-field";

export const imageField01 = <ImageField label="Photo" onChange={() => {}} />;
export const imageField02 = <ImageField label="Photo" maxFileSize={5 * 1024 * 1024} />;
export const imageFieldOk01 = <ImageField label="Photo" name="photo" shape="circle" crop maxSize={5 * 1024 * 1024} onFileChange={() => {}} className="mt-6" />;
