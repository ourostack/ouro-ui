// What agents write with preset-picker: snippets whose cases are in preset-picker.cases.ts.
import { PresetPicker } from "@/registry/ouro/components/ouro/preset-picker/preset-picker";

export const presetPicker01 = <PresetPicker label="Layouts" items={[]} onValueChange={() => {}} current="chats" />;
export const presetPicker02 = <PresetPicker label="Layouts" items={[]} onValueChange={() => {}} onSelect={() => {}} />;
export const presetPickerOk01 = <PresetPicker label="Layouts" items={[{ value: "chats", label: "Chats first", description: "Conversations wide.", tag: "Saved" }]} value="chats" onValueChange={() => {}} currentLabel="In use" className="mt-4" />;
