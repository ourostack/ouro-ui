import { PlanApproval } from "@/components/ouro/plan-approval/plan-approval";

// expect: data-ouro="plan-approval"
// expect: Rendered on the server
export default function PlanApprovalSection() {
  return (
    <PlanApproval title="Rendered on the server" answer={{ decision: "approved", by: "Ana" }}>
      Roast the lamb for an hour.
    </PlanApproval>
  );
}
