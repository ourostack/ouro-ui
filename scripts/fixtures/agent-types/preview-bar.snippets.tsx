// What agents write with preview-bar: snippets whose cases are in preview-bar.cases.ts.
import { PreviewBar } from "@/registry/ouro/components/ouro/preview-bar/preview-bar";

export const previewBar01 = <PreviewBar label="Trying the Ocean theme" onAccept={() => {}} onKeep={() => {}} onDiscard={() => {}} onCompareChange={() => {}} />;
export const previewBar02 = <PreviewBar label="Trying the Ocean theme" timeout={30} onKeep={() => {}} onDiscard={() => {}} onCompareChange={() => {}} />;
export const previewBarOk01 = <PreviewBar label="Trying the Ocean theme" seconds={30} keepLabel="Apply" compareKey="b" onKeep={() => {}} onDiscard={() => {}} onCompareChange={() => {}} className="mt-6" />;
