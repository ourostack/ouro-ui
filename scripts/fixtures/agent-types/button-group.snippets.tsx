// What agents write with button-group: snippets whose cases are in button-group.cases.ts.
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ButtonGroup } from "@/registry/ouro/components/ouro/button-group/button-group";

export const buttonGroup01 = <ButtonGroup label="Pages" variant="outline"><Button>Next</Button></ButtonGroup>;
export const buttonGroup02 = <ButtonGroup label="Pages" isAttached><Button>Next</Button></ButtonGroup>;
export const buttonGroupOk = <ButtonGroup label="Pages" fullWidth><Button variant="outline">Next</Button></ButtonGroup>;
