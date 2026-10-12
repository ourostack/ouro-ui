import { Progress } from "@/components/ouro/progress/progress";

// expect: Ouro progress
// Progress names its bar with its label in the server HTML.
// expect: aria-labelledby="[^"]*-label"[^>]*role="progressbar"
export default function ProgressSection() {
  return <Progress label="Ouro progress" value={40} showValue />;
}
