// What agents write with message: snippets whose cases are in message.cases.ts.
import { Message } from "@/registry/ouro/components/ouro/message/message";

export const message01 = <Message role="user" name="Ada" content="How long should it rest?" />;
export const message02 = <Message role="bot" name="Ouro">About an hour.</Message>;
export const message03 = <Message role="user" name="Ada" from="user">How long?</Message>;
export const messageOk01 = <Message role="assistant" name="Ouro" avatar="/ouro.png" streaming streamingLabel="Writing">About an hour.</Message>;
