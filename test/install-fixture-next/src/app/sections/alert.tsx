import { Alert } from "@/components/ouro/alert/alert";

// expect: Ouro alert
// expect: role="alert"
export default function AlertSection() {
  return <Alert tone="warning" title="Ouro alert" description="Rendered on the server." />;
}
