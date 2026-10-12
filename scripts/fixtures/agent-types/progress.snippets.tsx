// What agents write with progress: snippets whose cases are in progress.cases.ts.
import { Progress } from "@/registry/ouro/components/ouro/progress/progress";

export const progress01 = <Progress label="Importing" value={null} indeterminate />;
export const progress02 = <Progress value={40} />;
export const progressValid = <Progress label="Uploading" value={40} max={100} showValue tone="success" />;
