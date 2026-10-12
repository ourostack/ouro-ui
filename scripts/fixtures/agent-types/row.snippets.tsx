// What agents write with row: snippets whose cases are in row.cases.ts.
import { Row } from "@/registry/ouro/components/ouro/stack/row";

export const row01 = <Row gap={2}>Tags</Row>;
export const row02 = <Row justifyContent="space-between">Tags</Row>;
export const row03 = <Row direction="column">Tags</Row>;
export const row05 = <Row className="gap-2">Tags</Row>;
export const row06 = <Row className="max-sm:flex-col">Tags</Row>;
export const row07 = <Row className="flex-wrap">Tags</Row>;
export const row04 = <Row gap="xs" align="baseline" justify="end" wrap stackBelow="sm">Tags</Row>;
