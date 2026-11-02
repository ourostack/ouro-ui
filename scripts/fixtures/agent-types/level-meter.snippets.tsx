// What agents write with level-meter: snippets whose cases are in level-meter.cases.ts.
import { LevelMeter } from "@/registry/ouro/components/ouro/level-meter/level-meter";

export const levelMeter01 = <LevelMeter label="Microphone level" value={0.03} level={0.03} />;
export const levelMeter02 = <LevelMeter value={0.03} />;
export const levelMeter03 = <LevelMeter label="Microphone level" value={0.03} segments={10} />;
export const levelMeter04 = <LevelMeter label="Microphone level" value={45} />;
export const levelMeterValid = <LevelMeter label="Microphone level" hideLabel value={0.03} bars={5} size="sm" tone="success" />;
