export type Invoice = { id: string; amount: string; paid: boolean };

const invoices: Invoice[] = [
  { id: "inv-1", amount: "$40.00", paid: false },
  { id: "inv-2", amount: "$12.50", paid: true },
];

// The one handler behind every door: a screen's control, an MCP tool and WebMCP call these by action id.
export const handlers: Record<string, (input: { id?: string }) => unknown> = {
  list_invoices: () => ({ invoices: JSON.stringify(invoices) }),
  pay_invoice: ({ id }) => {
    const invoice = invoices.find((i) => i.id === id);
    if (!invoice) throw new Error(`there is no invoice "${id}". Fix: call list_invoices.`);
    invoice.paid = true;
    return { id: invoice.id };
  },
};

export function payNext(): string {
  const next = invoices.find((i) => !i.paid);
  if (!next) return "Every invoice is paid.";
  handlers["pay_invoice"]!({ id: next.id });
  return `Paid ${next.id}.`;
}
