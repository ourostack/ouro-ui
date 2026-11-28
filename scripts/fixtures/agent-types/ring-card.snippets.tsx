import { RingCard } from "@/registry/ouro/components/ouro/ring-card/ring-card";

export const ringCard01 = <RingCard caller="Mara Vale" kind="phone" announcement="Mara is calling." onDecline={() => {}} onAudio={() => {}} onVideo={() => {}} />;
export const ringCardOk01 = <RingCard caller="Mara Vale" kind="audio" announcement="Mara is calling." pending={{ label: "Connecting...", media: "audio" }} onDecline={() => {}} onAudio={() => {}} onVideo={() => {}} />;
