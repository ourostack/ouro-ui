import { defineAction, defineActions, field } from "../../scripts/ouro-actions/ouro-actions.mts";

export const listInvoices = defineAction({
  id: "list_invoices",
  consent: "read",
  label: "List invoices",
  description: "See the invoices and whether each is paid.",
  agent: "List the account's invoices: each one's id, amount and whether it is paid. Take an id from here for pay_invoice.",
  input: {},
  output: { invoices: field.string({ label: "Invoices", description: "The invoices, as JSON." }) },
  cli: "invoices list",
});

export const payInvoice = defineAction({
  id: "pay_invoice",
  consent: "write",
  label: "Pay invoice",
  description: "Pay one invoice with the card on file.",
  agent: "Pay one invoice with the card on file. Take the id from list_invoices.",
  input: { id: field.string({ label: "Invoice id", description: "The invoice's id, from list_invoices.", arg: true }) },
  output: { id: field.string({ label: "Invoice id", description: "The invoice that was paid." }) },
  cli: "invoices pay",
});

export default defineActions("incumbent-billing", [listInvoices, payInvoice], { tool: "billing" });
