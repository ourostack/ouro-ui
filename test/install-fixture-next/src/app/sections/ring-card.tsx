"use client";

import { RingCard } from "@/components/ouro/ring-card/ring-card";

// expect: data-ouro="ring-card"
// expect: Mara Vale
export default function RingCardSection() {
  return <RingCard caller="Mara Vale" kind="video" announcement="Mara Vale is calling." onDecline={() => {}} onAudio={() => {}} onVideo={() => {}} />;
}
