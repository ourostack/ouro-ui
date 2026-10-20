// What agents write with share-button: snippets whose cases are in share-button.cases.ts.
import { ShareButton } from "@/registry/ouro/components/ouro/share-button/share-button";

export const shareButton01 = <ShareButton href="https://example.com/notes/42" />;
export const shareButton02 = <ShareButton url="https://example.com/notes/42" onClick={() => {}} />;
export const shareButtonOk01 = <ShareButton url="https://example.com/notes/42" title="Trail notes" label="Share notes" hideLabel variant="plain" className="ms-auto" />;
