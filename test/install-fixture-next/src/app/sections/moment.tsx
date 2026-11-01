import { Moment } from "@/components/ouro/moment/moment";

// expect: Ouro moment
// expect: Rendered by a Server Component
// expect: data-moment="empty"
export default function MomentSection() {
  return (
    <Moment
      art={
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" fill="currentColor" />
        </svg>
      }
      title="Ouro moment"
      description="Rendered by a Server Component"
    />
  );
}
