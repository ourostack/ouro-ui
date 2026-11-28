import { Fragment, useMemo, type JSX, type ReactNode } from "react";
import { $getRoot, $isElementNode, $isLineBreakNode, $isTextNode, createEditor, type LexicalNode } from "lexical";
import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { $isLinkNode, LinkNode } from "@lexical/link";
import { $isListNode, ListItemNode, ListNode } from "@lexical/list";
import { $isCodeNode, CodeNode } from "@lexical/code-core";
import { $isHeadingNode, HeadingNode, QuoteNode } from "@lexical/rich-text";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { CodeBlock } from "@/registry/ouro/components/ouro/code-block/code-block";
import { safeHref } from "@/registry/ouro/components/ouro/composer/composer-styles";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";

const levels = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 } as const;

function draw(node: LexicalNode): ReactNode {
  if ($isLineBreakNode(node)) return <br />;
  if ($isTextNode(node)) {
    let text: ReactNode = node.getTextContent();
    if (node.hasFormat("bold")) text = <strong>{text}</strong>;
    if (node.hasFormat("italic")) text = <em>{text}</em>;
    if (node.hasFormat("strikethrough")) text = <s>{text}</s>;
    if (node.hasFormat("underline")) text = <u>{text}</u>;
    if (node.hasFormat("code")) text = <code>{text}</code>;
    return text;
  }
  if (!$isElementNode(node)) throw new Error(`Unsupported invitation node: ${node.getType()}`);
  const children = node.getChildren().map((child) => <Fragment key={child.getKey()}>{draw(child)}</Fragment>);
  if ($isCodeNode(node)) return <CodeBlock code={node.getTextContent()} wrap />;
  if ($isHeadingNode(node)) return <Heading level={levels[node.getTag()]}>{children}</Heading>;
  if ($isLinkNode(node)) {
    if (node.getURL().startsWith("#person-")) return <Badge tone="primary" variant="soft">{children}</Badge>;
    const href = safeHref(node.getURL());
    return href ? <Link href={href}>{children}</Link> : <>{children}</>;
  }
  if ($isListNode(node)) return node.getListType() === "number"
    ? <ol start={node.getStart()} className="list-decimal ps-5">{children}</ol>
    : <ul className="list-disc ps-5">{children}</ul>;
  if (node.getType() === "listitem") return <li>{children}</li>;
  if (node.getType() === "quote") return <blockquote>{children}</blockquote>;
  return <Text>{children}</Text>;
}

export default function ComposerPreview({ text }: { text: string }): JSX.Element {
  const content = useMemo(() => {
    const editor = createEditor({
      namespace: "composer-preview",
      nodes: [HeadingNode, QuoteNode, LinkNode, ListNode, ListItemNode, CodeNode],
      onError: (error) => { throw error; },
    });
    const markdown = text.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, id: string) => `[${label}](#person-${encodeURIComponent(id)})`);
    editor.update(() => $convertFromMarkdownString(markdown, TRANSFORMERS), { discrete: true });
    return editor.getEditorState().read(() => $getRoot().getChildren().map((node) => <Fragment key={node.getKey()}>{draw(node)}</Fragment>));
  }, [text]);
  return (
    <Message variant="chat" role="user" name="You" avatar={false} context="Sent in this demo">
      <div className="grid gap-3">{content}</div>
    </Message>
  );
}
