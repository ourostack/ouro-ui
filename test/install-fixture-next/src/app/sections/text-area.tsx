import { TextArea } from "@/components/ouro/text-field/text-area";

// expect: Ouro text area
// expect: Text area error
export default function TextAreaSection() {
  return <TextArea label="Ouro text area" name="message" autoGrow rows={2} maxRows={6} error="Text area error" />;
}
