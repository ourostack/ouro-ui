# Changes in this release

- New: the agent quickstart (docs/agent-quickstart.md), the steps and whole files for a new Vite app with a validated form, a color scheme toggle and a confirmation dialog, and llms.txt points to it first.
- Toaster: when keyboard focus lands under the stack and the top edge would cover the control too, the stack [stays where it is](registry/ouro/components/ouro/toast/toaster.test.tsx "verify:testExists(registry/ouro/components/ouro/toast/toaster.test.tsx::keyboard focus under the stack > leaves the stack where it is when the front toast covers the control and the top edge is out of reach)") rather than collapsing to its newest toast, until the collapse fade restart in WebKit is understood (ourostack/ouro-ui#1789).
