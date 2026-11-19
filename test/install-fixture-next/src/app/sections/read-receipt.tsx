import { ReadReceipt } from "@/components/ouro/read-receipt/read-receipt";

// expect: data-ouro="read-receipt"
// expect: Seen by Ana Lind
export default function ReadReceiptSection() {
  return <ReadReceipt readers={[{ name: "Ana Lind" }]} />;
}
