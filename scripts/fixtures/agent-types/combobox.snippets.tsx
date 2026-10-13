// What agents write with combobox: snippets whose cases are in combobox.cases.ts.
import { Combobox } from "@/registry/ouro/components/ouro/combobox/combobox";

export const combobox01 = <Combobox label="Herb" items={[]} options={["Basil", "Dill"]} />;
export const combobox02 = <Combobox label="Herbs" items={["Basil"]} isMulti />;
export const combobox03 = <Combobox label="Cuisine" items={["Thai"]} freeSolo />;
export const combobox04 = <Combobox label="Recipe" items={[]} onSearch={() => {}} />;
export const combobox05 = <Combobox label="Herb" items={["Basil"]} isLoading />;
export const comboboxOk01 = <Combobox label="Herbs" name="herbs" multiple items={["Basil", "Dill"]} defaultValue={["Basil"]} required placeholder="Add a herb" />;
export const comboboxOk02 = <Combobox label="Recipe" items={[]} loading onInputChange={() => {}} emptyLabel="No recipes" />;
