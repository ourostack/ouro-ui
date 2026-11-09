// What agents write with family-bar: snippets whose cases are in family-bar.cases.ts.
import { FamilyBar } from "@/registry/ouro/components/ouro/family-bar/family-bar";

const sites = [{ id: "home", label: "Lantern", href: "https://example.com/" }, { id: "docs", label: "Docs", href: "https://docs.example.com/" }];

export const familyBar01 = <FamilyBar links={sites} currentPath="/docs" />;
export const familyBar02 = <FamilyBar links={sites} items={sites} />;
export const familyBar03 = <FamilyBar links={sites}>Docs</FamilyBar>;
export const familyBarOk01 = <FamilyBar links={sites} current="docs" label="Sites" brand={<span>Lantern</span>} className="sticky top-0" />;
