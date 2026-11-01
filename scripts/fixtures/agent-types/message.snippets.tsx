// What agents write with message: snippets whose cases are in message.cases.ts.
import { Message } from "@/registry/ouro/components/ouro/message/message";

export const message01 = <Message role="user" name="Ada" content="How long should it rest?" />;
export const message02 = <Message role="bot" name="Ouro">About an hour.</Message>;
export const message03 = <Message role="user" name="Ada" from="user">How long?</Message>;
export const message04 = <Message role="user" name="Ada" own>Mine</Message>;
export const message05 = <Message role="assistant" name="Grace" timestamp="9:41">Hi</Message>;
export const message06 = <Message variant="chat" role="assistant" name="Grace" presence="busy">Lunch?</Message>;
export const message07 = <Message variant="chat" role="user" name="Ada" replyTo="message-1">Count me in</Message>;
export const message08 = <Message variant="reply" role="assistant" name="Grace" actionsPlacement="right">On it</Message>;
export const message09 = <Message variant="chat" role="user" name="Ada" status="failed">On my way</Message>;
export const messageOk01 = <Message role="assistant" name="Ouro" avatar="/ouro.png" streaming streamingLabel="Writing">About an hour.</Message>;
export const messageOk02 = <Message variant="chat" role="assistant" name="Grace" avatar={<span />} time="9:41 AM" dateTime="2026-05-04T09:41" continued footer={<span />} thread={null} actions={[{ key: "reply", label: "Reply", icon: "↩", onClick: () => {}, disabled: false }]} menu={[{ label: "Copy link", onClick: () => {} }]} actionsPlacement="beside" actionsLabel="Message actions" menuLabel="More actions">Lunch?</Message>;
export const messageOk03 = <Message variant="post" role="assistant" name="Grace" subject="Launch plan">Notes</Message>;
export const messageOk04 = <Message variant="chat" role="assistant" name="Grace" presence="away" presenceLabel="Away">Back soon</Message>;
export const messageOk05 = <Message variant="chat" role="user" name="Ada" quote={{ author: "Grace", excerpt: "Lunch on Friday?", onActivate: () => {}, label: "Quoting Grace" }}>Count me in</Message>;
export const messageOk06 = <Message variant="chat" role="user" name="Ada" failed={{ onRetry: () => {}, onDelete: () => {} }} failedLabel="Not sent" retryLabel="Retry" deleteLabel="Delete">On my way</Message>;
