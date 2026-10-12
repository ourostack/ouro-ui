// What agents write with file-field: snippets whose cases are in file-field.cases.ts.
import { FileField } from "@/registry/ouro/components/ouro/file-field/file-field";

export const fileField01 = <FileField label="Photo" maxFileSize={5000000} />;
export const fileField02 = <FileField label="Photo" acceptedFileTypes={["image/png"]} />;
export const fileFieldOk = <FileField label="Photo" name="photo" accept="image/*" maxSize={5 * 1024 * 1024} multiple required />;
