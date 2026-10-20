import { ShareButton } from "@/components/ouro/share-button/share-button";

// expect: data-ouro="share-button"
// expect: Ouro share button
export default function ShareButtonSection() {
  return <ShareButton url="https://example.com/ouro" label="Ouro share button" />;
}
