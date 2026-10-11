"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { OuroProvider } from "@/lib/ouro/ouro-provider";

// A Server Component can't pass next/link's Link (a function) to a Client Component, so the
// provider gets it here, in a client file.
export function Providers({ children }: { children: ReactNode }) {
  return <OuroProvider linkComponent={Link}>{children}</OuroProvider>;
}
