// What agents write with local-date: snippets whose cases are in local-date.cases.ts.
import { LocalDate } from "@/registry/ouro/components/ouro/local-date/local-date";

const updatedAt = new Date("2026-06-01T09:30:00Z");

export const localDate01 = <LocalDate value={updatedAt} dateTime={updatedAt.toISOString()} />;
export const localDate02 = <LocalDate value={updatedAt}>June 1</LocalDate>;
export const localDateOk01 = <LocalDate value={updatedAt} format="datetime" locale="en-US" className="ms-1" />;
