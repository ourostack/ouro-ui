import { type JSX } from "react";
import { PlanApproval } from "@/registry/ouro/components/ouro/plan-approval/plan-approval";

// The live demo at the top of docs/plan-approval/: the component as an app would use it, with its props, nothing else.

export default function PlanApprovalDemo(): JSX.Element {
  return (
    <div className="grid w-full max-w-xl gap-3">
      <PlanApproval headingLevel={2} title="Your agent's plan for dinner" onApprove={() => {}} onRequestChanges={() => {}}>
        <ol className="m-0 grid gap-1 ps-5">
          <li>Roast the lamb at 200°C for an hour, with the carrots beside it.</li>
          <li>Start the rice on the stove twenty minutes before the end.</li>
          <li>Wilt the greens in the rice's last five minutes.</li>
        </ol>
      </PlanApproval>
      <PlanApproval
        headingLevel={2}
        title="Research helper's plan for the menu"
        answer={{ decision: "changes-requested", by: "Ana", app: "their phone", at: "9:41", feedback: "Make it vegetarian; swap the lamb for a squash." }}
      >
        <p className="m-0">A roast, two sides and a pudding, for six.</p>
      </PlanApproval>
    </div>
  );
}
