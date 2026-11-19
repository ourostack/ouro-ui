// What agents write with read-receipt: snippets whose cases are in read-receipt.cases.ts.
import { ReadReceipt } from "@/registry/ouro/components/ouro/read-receipt/read-receipt";

export const readReceipt01 = <ReadReceipt readers={[]} readBy={[{ name: "Ana Lind" }]} />;
export const readReceipt02 = <ReadReceipt readers={[]} max={5} />;
export const readReceiptOk01 = <ReadReceipt readers={[{ name: "Ana Lind", src: "/ana.jpg", idForColor: "u-1", initials: "A" }]} label={(names) => `Vu par ${names.join(", ")}`} className="ms-auto" />;
