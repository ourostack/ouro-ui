p='registry/ouro/components/ouro/message/message-list.tsx'
s=open(p).read()
while '<<<<<<< ' in s:
    a=s.index('<<<<<<< '); a2=s.index('\n',a)+1; m=s.index('=======\n',a); b=s.index('>>>>>>> ',m); b2=s.index('\n',b)+1
    ours=s[a2:m]
    if 'const atOf' not in ours and 'const all = ' not in ours and 'let anchors' not in ours:
        raise SystemExit("unexpected conflict:\n"+s[a:b2])
    s=s[:a]+ours+s[b2:]
# messages' boxes in the anchoring read where they are laid out, not where the springs draw them
start=s.index('const atOf = (node: Element) =>'); end=s.index('taken = scroller.scrollTop;', start)
seg=s[start:end]
seg=seg.replace("node.getBoundingClientRect().top - content","boxOf(node).top - content")
seg=seg.replace("message.getBoundingClientRect()","boxOf(message)")
s=s[:start]+seg+s[end:]
open(p,'w').write(s)
