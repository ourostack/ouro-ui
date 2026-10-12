import { Link } from "@/components/ouro/link/link";

// expect: Ouro text link
// expect: Ouro external link
// expect: opens in a new tab
// Link's href through the same linkComponent path.
// expect: href="/cookbooks"
export default function LinkSection() {
  return (
    <>
      <Link href="/cookbooks">Ouro text link</Link>
      <Link href="https://ouro.bot" external>
        Ouro external link
      </Link>
    </>
  );
}
