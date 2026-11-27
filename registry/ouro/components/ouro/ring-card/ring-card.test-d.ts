import { expectTypeOf } from "vitest";
import type { RingCardProps } from "@/registry/ouro/components/ouro/ring-card/ring-card";

type RequiredProps = Pick<RingCardProps, "caller" | "kind" | "announcement" | "onDecline" | "onAudio" | "onVideo">;
expectTypeOf<RequiredProps>().toExtend<RingCardProps>();
expectTypeOf<Omit<RequiredProps, "caller">>().not.toExtend<RingCardProps>();
expectTypeOf<Omit<RequiredProps, "onDecline">>().not.toExtend<RingCardProps>();
expectTypeOf<Omit<RequiredProps, "announcement">>().not.toExtend<RingCardProps>();
expectTypeOf<Omit<RequiredProps, "kind"> & { kind: "phone" }>().not.toExtend<RingCardProps>();
expectTypeOf<RequiredProps & { pending: { label: string; media: "screen" } }>().not.toExtend<RingCardProps>();
