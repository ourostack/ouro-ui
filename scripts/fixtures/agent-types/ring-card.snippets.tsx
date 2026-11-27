import { RingCard } from "@/registry/ouro/components/ouro/ring-card/ring-card";

const actions = { onDecline: () => {}, onAudio: () => {}, onVideo: () => {} };
export const ringCard01 = <RingCard {...actions} caller="Mara Vale" kind="phone" announcement="Mara is calling." />;
export const ringCardOk01 = <RingCard {...actions} caller="Mara Vale" kind="audio" announcement="Mara is calling." pending={{ label: "Connecting...", media: "audio" }} />;
