// What agents write with popover: snippets whose cases are in popover.cases.ts.
import { createRef } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Popover } from "@/registry/ouro/components/ouro/popover/popover";
import { open, setOpen } from "./helpers.ts";

const anchor = createRef<HTMLButtonElement>();

export const popover01 = <Popover title="Share" trigger={<Button>Share</Button>} placement="bottom-start">Body</Popover>;
export const popover02 = <Popover title="Share" open={open} onOpenChange={setOpen}>Body</Popover>;
export const popover03 = <Popover title="Share" trigger={<Button>Share</Button>} side="above">Body</Popover>;
export const popover04 = <Popover title="Share" trigger={<Button>Share</Button>} content="Body" />;
export const popoverOk01 = <Popover title="Share" open={open} onOpenChange={setOpen} anchor={anchor} side="top" align="start" presentation="auto">Body</Popover>;
