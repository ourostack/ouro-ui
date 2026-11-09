// What agents write with family-footer: snippets whose cases are in family-footer.cases.ts.
import { FamilyFooter } from "@/registry/ouro/components/ouro/family-bar/family-footer";

const sites = [{ id: "home", label: "Lantern", href: "https://example.com/" }, { id: "docs", label: "Docs", href: "https://docs.example.com/" }];

export const familyFooter01 = <FamilyFooter links={sites} currentPath="/docs" />;
export const familyFooterOk01 = <FamilyFooter links={sites} current="docs" label="All sites" className="mt-auto"><span>Made in the open.</span></FamilyFooter>;
