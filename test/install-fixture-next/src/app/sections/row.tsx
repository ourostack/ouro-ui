import { Row } from "@/components/ouro/stack/row";

// expect: Ouro row
// expect: data-ouro="row"
export default function RowSection() {
  return (
    <Row justify="between">
      <span>Ouro row</span>
    </Row>
  );
}
