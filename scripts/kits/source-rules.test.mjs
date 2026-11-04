import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { each, expect, vi } from "./expect.mjs";
import { BASELINE_PATH, CATEGORIES, CONFIG_PATH, CONTENT_SPINNER_FIX, loadConfig, compareWithBaseline, countFingerprints, defaultCliErrorHandler, defaultDeps, defaultExit, findOffenders, findOffendersInSource, findRegressions, formatComparison, isCliEntry, isControlStateClass, isScannedFile, isThirdPartyControlModule, LAYOUT_ANIMATION_FIX, layoutAnimationClass, layoutTransitionProperty, listSourceFiles, loadPaths, main, RENDER_INDEX_FIX, runCliIfEntry, serializeBaseline, THIRD_PARTY_CONTROL_PACKAGES, BARE_FAILURE, VAGUE_FAILURE_COPY_FIX, VAGUE_FAILURE_PHRASES, narrowedSettings, vagueFailurePhrase, } from "../../registry/ouro/source-rules/source-rules.mjs";
const scan = (source, file = "app/routes/fixture.tsx") => findOffendersInSource(file, source);
const PATHS = { "~/*": ["./app/*"], "#dialog": ["./app/components/dialog"] };
const scanFiles = (files) => findOffenders(Object.keys(files), { root: "/repo", readFile: (file) => files[path.relative("/repo", file)], paths: PATHS });
const categories = (source, file) => scan(source, file).map((offender) => offender.category);
const fingerprints = (source, file) => scan(source, file).map((offender) => offender.fingerprint);
describe("findOffendersInSource: each category", () => {
    it("lists the categories", () => {
        expect(CATEGORIES).toEqual([
            "raw-button",
            "raw-anchor",
            "raw-input",
            "raw-select",
            "raw-textarea",
            "details-summary",
            "contenteditable",
            "positive-tabindex",
            "interactive-role",
            "plain-element-handler",
            "data-ouro-attr",
            "control-state-style",
            "layout-animation",
            "third-party-control",
            "content-spinner",
            "render-index",
            "vague-failure-copy",
            "uses-hand-rolled-control",
        ]);
    });
    it("finds a raw <button>, with its stable props in the fingerprint", () => {
        expect(scan(`export function Save() { return <button type="button" aria-label="Save">Save</button>; }`)).toEqual([
            {
                category: "raw-button",
                fingerprint: "app/routes/fixture.tsx::Save::raw-button::button::type=button,aria-label=Save",
                file: "app/routes/fixture.tsx",
                line: 1,
            },
        ]);
    });
    it("finds a raw <a>", () => {
        expect(fingerprints(`function Nav() { return <a href="/recipes">Recipes</a>; }`)).toEqual([
            "app/routes/fixture.tsx::Nav::raw-anchor::a::",
        ]);
    });
    it("finds React Router's Link and NavLink, by their imported names", () => {
        const source = `
      import { Link as RouterLink, NavLink, useNavigate } from "react-router";
      import type { LinkProps } from "react-router";
      import { Link as DomLink } from "react-router-dom";
      import * as Router from "react-router";
      export function Nav() {
        return <>
          <RouterLink to="/a">A</RouterLink>
          <NavLink to="/b" />
          <DomLink to="/c" />
          <Router.Link to="/d" />
          <Router.Form method="post" />
          <Other.Link to="/e" />
        </>;
      }`;
        expect(fingerprints(source)).toEqual([
            "app/routes/fixture.tsx::Nav::raw-anchor::react-router.Link::",
            "app/routes/fixture.tsx::Nav::raw-anchor::react-router.NavLink::",
            "app/routes/fixture.tsx::Nav::raw-anchor::react-router.Link::",
            "app/routes/fixture.tsx::Nav::raw-anchor::react-router.Link::",
        ]);
    });
    it("finds visible inputs, selects and textareas", () => {
        const source = `function Fields({ kind }) {
      return <form>
        <input name="q" />
        <input type="text" name="title" />
        <input type={kind} />
        <select name="unit" />
        <textarea name="notes"></textarea>
      </form>;
    }`;
        expect(fingerprints(source)).toEqual([
            "app/routes/fixture.tsx::Fields::raw-input::input::name=q",
            "app/routes/fixture.tsx::Fields::raw-input::input::type=text,name=title",
            "app/routes/fixture.tsx::Fields::raw-input::input::type={kind}",
            "app/routes/fixture.tsx::Fields::raw-select::select::name=unit",
            "app/routes/fixture.tsx::Fields::raw-textarea::textarea::name=notes",
        ]);
    });
    it("finds <details> and <summary>", () => {
        expect(fingerprints(`function More() { return <details><summary>More</summary></details>; }`)).toEqual([
            "app/routes/fixture.tsx::More::details-summary::details::",
            "app/routes/fixture.tsx::More::details-summary::summary::",
        ]);
    });
    it("finds contentEditable unless it is literally false", () => {
        const source = `function Edit({ on }) {
      return <>
        <div contentEditable />
        <div contentEditable="true" />
        <div contentEditable={true} />
        <p contenteditable="plaintext-only" />
        <div contentEditable={on} />
        <div contentEditable="false" />
        <div contentEditable={false} />
      </>;
    }`;
        expect(categories(source)).toEqual(Array(5).fill("contenteditable"));
    });
    it("finds a positive tabIndex, including one branch of a conditional", () => {
        const source = `function Order({ on, n }) {
      return <>
        <div tabIndex={1} />
        <div tabIndex="2" />
        <span tabindex="3" />
        <div tabIndex={on ? 4 : -1} />
        <div tabIndex={0} />
        <div tabIndex={-1} />
        <div tabIndex="-1" />
        <div tabIndex={on ? 0 : -1} />
        <div tabIndex={n} />
      </>;
    }`;
        expect(categories(source)).toEqual(Array(4).fill("positive-tabindex"));
    });
    it("finds interactive roles, static or chosen at runtime, on any element", () => {
        const source = `function Roles({ open }) {
      return <>
        <div role="button" />
        <li role="option tab" />
        <Card role={open ? "dialog" : "switch"} />
        <section role="region" />
        <div role={open ? "dialog" : "note"} />
      </>;
    }`;
        expect(fingerprints(source)).toEqual([
            "app/routes/fixture.tsx::Roles::interactive-role::div::role=button",
            "app/routes/fixture.tsx::Roles::interactive-role::li::role=option tab",
            'app/routes/fixture.tsx::Roles::interactive-role::Card::role={open ? "dialog" : "switch"}',
        ]);
    });
    it("finds click, key, pointer and touch handlers on plain elements only", () => {
        const source = `function Handlers({ go }) {
      return <>
        <div onClick={go} />
        <li onKeyDown={go} onClick={go} />
        <span onPointerDown={go} />
        <article onTouchStartCapture={go} />
        <figure onMouseDown={go} />
        <div onMouseEnter={go} onFocus={go} onChange={go} />
        <form onSubmit={go} />
        <button type="button" onClick={go} />
        <Button onClick={go} />
      </>;
    }`;
        expect(categories(source)).toEqual([
            "plain-element-handler",
            "plain-element-handler",
            "plain-element-handler",
            "plain-element-handler",
            "plain-element-handler",
            "raw-button",
        ]);
    });
    it("finds any data-ouro* attribute app code writes: in JSX, in props objects and through setAttribute", () => {
        const source = `function Marks({ el }) {
      el.setAttribute("data-ouro-control", "checkbox");
      el.toggleAttribute("data-ouro");
      el.setAttribute("data-theme", "dark");
      el.setAttribute(name, "x");
      el.querySelector("[data-ouro-control] button");
      const props = { "data-ouro-part": "row", "data-other": 1, plain: 2, [key]: 3 };
      return <>
        <div data-ouro-control="checkbox" />
        <Button data-ouro="button" />
        <div data-testid="row" />
      </>;
    }`;
        expect(fingerprints(source)).toEqual([
            "app/routes/fixture.tsx::Marks::data-ouro-attr::setAttribute::",
            "app/routes/fixture.tsx::Marks::data-ouro-attr::setAttribute::",
            "app/routes/fixture.tsx::Marks::data-ouro-attr::object::",
            "app/routes/fixture.tsx::Marks::data-ouro-attr::div[data-ouro-control]::",
            "app/routes/fixture.tsx::Marks::data-ouro-attr::Button[data-ouro]::",
        ]);
    });
    describe("control-state-style in className", () => {
        it("finds focus, press, aria and data state utilities in a className literal", () => {
            const source = `function Styles() {
        return <>
          <div className="rounded focus-visible:outline-2" />
          <div className="active:scale-95" />
          <div className="aria-pressed:bg-black" />
          <div className="data-[state=open]:rotate-180" />
          <div className="group-data-[checked]/row:line-through" />
          <div className="md:dark:focus:ring-2" />
        </>;
      }`;
            expect(categories(source)).toEqual(Array(6).fill("control-state-style"));
        });
        it("follows class strings through constants, calls, objects, helpers and templates", () => {
            const source = `
        const ring = "focus-visible:ring-2";
        const tones = { on: "aria-checked:bg-accent", off: "bg-paper" };
        function stateClass(open) { return open ? "data-open:rotate-90" : ""; }
        const recursive = recursive;
        export function Styles({ open, tone }) {
          return <>
            <div className={ring} />
            <div className={cn("p-2", tones[tone])} />
            <div className={stateClass(open)} />
            <div className={\`grid \${open ? "has-[:checked]:bg-white" : ""}\`} />
            <div className={\`grid focus:outline-none \${tone}\`} />
            <div className={recursive} />
            <Row rowClassName="peer-aria-expanded:block" />
          </>;
        }`;
            expect(categories(source)).toEqual(Array(6).fill("control-state-style"));
        });
        it("leaves hover-only decoration, theme and layout alone", () => {
            const source = `
        import { Photo } from "~/components/recipe/photo";
        export function Tile() {
          return <div className="group">
            <img className="transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none" />
            <Photo className="pointer-fine:hover:opacity-90 dark:bg-black data-[theme=dark]:text-white aria-[sort=ascending]:font-bold" />
            <p className="text-sm">Note: focus: stays plain prose</p>
          </div>;
        }`;
            expect(scan(source)).toEqual([]);
        });
    });
});
describe("content-spinner", () => {
    const SPINNER = `import { Spinner } from "~/components/ouro/spinner/spinner";`;
    const BUTTON = `import { Button } from "~/components/ouro/button/button";`;
    it("finds Ouro UI's Spinner standing in for content, counted where it is written", () => {
        expect(scan(`${SPINNER} export function Messages({ loading }) { return loading ? <div className="grid h-full place-items-center"><Spinner label="Loading messages" /></div> : null; }`)).toEqual([
            { category: "content-spinner", fingerprint: "app/routes/fixture.tsx::Messages::content-spinner::~/components/ouro/spinner/spinner.Spinner::", file: "app/routes/fixture.tsx", line: 1 },
        ]);
    });
    it("finds it by a relative path, a namespace import, an alias and createElement", () => {
        expect(categories(`import { Spinner as Busy } from "../components/ouro/spinner/spinner.tsx"; export function A() { return <Busy label="Loading" />; }`)).toEqual(["content-spinner"]);
        expect(categories(`import * as S from "@/components/ouro/spinner/spinner"; export function A() { return <S.Spinner label="Loading" />; }`)).toEqual(["content-spinner"]);
        expect(categories(`import { createElement } from "react"; ${SPINNER} export function A() { return createElement(Spinner, { label: "Loading" }); }`)).toEqual(["content-spinner"]);
    });
    it("finds a hand-made spinner by its animate-spin class, under any variant", () => {
        expect(fingerprints(`export function Busy() { return <span className="size-6 rounded-full motion-safe:animate-spin" />; }`)).toEqual(["app/routes/fixture.tsx::Busy::content-spinner::span::"]);
        expect(categories(`export function Busy() { return <span className="animate-spin-slow" />; }`)).toEqual(["content-spinner"]);
        expect(categories(`export function Busy() { return <svg className="animate-[spin_1s_linear_infinite]" />; }`)).toEqual(["content-spinner"]);
        expect(categories(`const spin = "!animate-[ouro-spin_1s_linear_infinite]"; export function Busy() { return <svg className={spin}><circle /></svg>; }`)).toEqual(["content-spinner"]);
    });
    it("allows the named exception, an inline busy indicator inside a button, in its children or its props", () => {
        expect(scan(`${SPINNER} ${BUTTON} export function Save() { return <Button disabled><Spinner size="sm" label="Saving" /> Save</Button>; }`)).toEqual([]);
        expect(scan(`${SPINNER} ${BUTTON} export function Save() { return <Button startIcon={<Spinner size="sm" label="Saving" />}>Save</Button>; }`)).toEqual([]);
        expect(scan(`${BUTTON} export function Save({ busy }) { return <Button className={busy ? "[&_svg]:animate-spin" : ""}>Save</Button>; }`)).toEqual([]);
        expect(categories(`export function Save() { return <button type="button"><span className="animate-spin" /> Save</button>; }`)).toEqual(["raw-button"]);
        expect(categories(`function Box(props) { return null; } export function Save() { return <Box as="button"><span className="animate-spin" /></Box>; }`)).toEqual(["raw-button"]);
    });
    it("does not take another Spinner, a spinner that is not in a button, or a component that is not Ouro's Button for the exception", () => {
        expect(scan(`import { Spinner } from "~/components/loading"; export function A() { return <Spinner />; }`)).toEqual([]);
        expect(scan(`${SPINNER} export function A() { return <Spinner.Dots />; }`)).toEqual([]);
        expect(categories(`${SPINNER} import { Button } from "~/components/fancy-button"; export function A() { return <Button><Spinner label="Loading" /></Button>; }`)).toEqual(["content-spinner"]);

        expect(categories(`${SPINNER} function Panel(props) { return null; } export function A() { return <Panel><Spinner label="Loading" /></Panel>; }`)).toEqual(["content-spinner"]);
        expect(categories(`export function A() { return <span className="animate-ping animate-[ouro-pulse_1s_infinite] spin" />; }`)).toEqual([]);
    });
    it("lets inline progress for an action through: in a prop, in an object's icon, or beside the words that say what is under way", () => {
        expect(scan(`${SPINNER} export function A() { return <span className="flex gap-2"><Spinner size="sm" label="Saving" /> Saving…</span>; }`)).toEqual([]);
        expect(scan(`${SPINNER} import { TextField } from "~/components/ouro/text-field/text-field"; export function A() { return <TextField label="Find" endAdornment={<Spinner size="sm" label="Searching" />} />; }`)).toEqual([]);
        expect(scan(`${SPINNER} import { toast } from "~/lib/ouro/toast"; export function upload() { toast("Uploading", { icon: <Spinner size="sm" /> }); }`)).toEqual([]);
        expect(scan(`${SPINNER} export const entries = [{ label: "Syncing", icon: <Spinner size="sm" /> }];`)).toEqual([]);
        expect(scan(`${SPINNER} ${BUTTON} export function A() { return <div><Spinner label="Loading" /><Button>Retry</Button></div>; }`)).toEqual([]);
        expect(scan(`${SPINNER} export function A({ rows }) { return <ul>{rows}{<Spinner label="Loading more" />}</ul>; }`)).toEqual([]);
    });
    it("finds a spinner that stands where content would: the only thing in its element, through a condition, or returned alone", () => {
        expect(categories(`${SPINNER} export function A({ loading, list }) { return <section>{loading ? <Spinner label="Loading" /> : null}</section>; }`)).toEqual(["content-spinner"]);
        expect(categories(`${SPINNER} export function A({ loading }) { return <>{loading && (<Spinner label="Loading" />)}</>; }`)).toEqual(["content-spinner"]);
        expect(categories(`${SPINNER} export function A() { return <div>\n  <Spinner label="Loading" />\n  {/* the rows */}\n</div>; }`)).toEqual(["content-spinner"]);
        expect(categories(`${SPINNER} export const busy = <Spinner label="Loading" />;`)).toEqual(["content-spinner"]);
    });
    it("never makes the component around it a hand-rolled control at its call sites", () => {
        const offenders = scanFiles({
            "app/components/loading.tsx": `${SPINNER} export function Loading() { return <Spinner label="Loading" />; }`,
            "app/routes/home.tsx": `import { Loading } from "~/components/loading"; export function Home() { return <Loading />; }`,
        });
        expect(offenders.map((offender) => offender.category)).toEqual(["content-spinner"]);
    });
    it("names the Skeleton fix and the button exception in its message", () => {
        const comparison = compareWithBaseline([{ fingerprint: "app/x.tsx::A::content-spinner::span::", file: "app/x.tsx", line: 4 }], {});
        expect(formatComparison(comparison)).toEqual([`New spinner standing in for content: app/x.tsx::A::content-spinner::span:: (+1) at app/x.tsx:4. ${CONTENT_SPINNER_FIX}`]);
        expect(CONTENT_SPINNER_FIX).toContain('<Skeleton shape="row" count={6}>');
        expect(CONTENT_SPINNER_FIX).toContain("Inline progress for an action is allowed: a spinner inside a button (<Button loading>)");
    });
});
describe("render-index", () => {
    it("finds an index built at the top of a component's render, with the variable it is assigned to", () => {
        expect(scan(`export function Rows({ rows }) {\n  const byId = new Map(rows.map((row) => [row.id, row]));\n  return <ul>{rows.length}</ul>;\n}`)).toEqual([
            { category: "render-index", fingerprint: "app/routes/fixture.tsx::Rows::render-index::Map::byId", file: "app/routes/fixture.tsx", line: 2 },
        ]);
    });
    it("finds each builder: Map, Set, RegExp, Object.fromEntries, Object.groupBy and Map.groupBy", () => {
        const source = `export function Search({ rows, query, tags }) {
          const a = new Set(tags);
          const b = new RegExp(query, "i");
          const c = Object.fromEntries(rows);
          const d = Object.groupBy(rows, (row) => row.kind);
          const e = Map.groupBy(rows, (row) => row.kind);
          return null;
        }`;
        expect(fingerprints(source)).toEqual([
            "app/routes/fixture.tsx::Search::render-index::Set::a",
            "app/routes/fixture.tsx::Search::render-index::RegExp::b",
            "app/routes/fixture.tsx::Search::render-index::Object.fromEntries::c",
            "app/routes/fixture.tsx::Search::render-index::Object.groupBy::d",
            "app/routes/fixture.tsx::Search::render-index::Map.groupBy::e",
        ]);
    });
    it("finds one in JSX, a hook's argument, a custom hook, an arrow component, memo, forwardRef and a class's render", () => {
        const source = `
          import { memo, forwardRef, useState } from "react";
          import * as React from "react";
          export const List = ({ ids }) => <Rows selected={new Set(ids)} />;
          export function Picker({ ids }) { const [chosen] = useState(new Set(ids)); return chosen.size; }
          export function useIndex(rows) { return new Map(rows); }
          export const Row = memo(({ tags }) => { const set = new Set(tags); return set.size; });
          export const Field = React.forwardRef(function (props, ref) { const pattern = (new RegExp(props.pattern)); return pattern.source; });
          export class Table extends React.Component { render() { const index = new Map(this.props.rows); return index.size; } }`;
        expect(fingerprints(source)).toEqual([
            "app/routes/fixture.tsx::List::render-index::Set::",
            "app/routes/fixture.tsx::Picker::render-index::Set::",
            "app/routes/fixture.tsx::useIndex::render-index::Map::",
            "app/routes/fixture.tsx::Row::render-index::Set::set",
            "app/routes/fixture.tsx::Field::render-index::RegExp::pattern",
            "app/routes/fixture.tsx::Table::render-index::Map::index",
        ]);
    });
    it("passes an index built in useMemo, a lazy initializer, an effect, an event handler or at module scope", () => {
        const source = `
          import { useEffect, useMemo, useState } from "react";
          const KINDS = new Set(["a", "b"]);
          const byKind = Object.fromEntries([["a", 1]]);
          export function Rows({ rows, query }) {
            const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
            const [seen] = useState(() => new Set(rows));
            useEffect(() => { const index = new Map(rows); index.clear(); }, [rows]);
            const onSearch = () => new RegExp(query);
            function onPick(event) { return Object.fromEntries(new FormData(event.target)); }
            return <input onChange={(event) => new Set(event.target.value)} />;
          }`;
        expect(scan(source).filter((offender) => offender.category === "render-index")).toEqual([]);
    });
    it("passes an empty Map or Set, another constructor, and a function that is no component, hook or render", () => {
        const source = `
          export function Rows() { const seen = new Set(); const cache = new Map(); const when = new Date(0); return null; }
          export function indexRows(rows) { return new Map(rows); }
          export const toIndex = (rows) => new Set(rows);
          export const Lookup = { build: (rows) => new Map(rows) };
          export class Store { constructor(rows) { this.index = new Map(rows); } get Index() { return new Map(this.rows); } render() { return new Set(this.rows); } }
          export const helper = { render() { return new Set([1]); } };`;
        expect(scan(source)).toEqual([]);
    });
    it("skips a route handler, an all-capitals function and a capitalised function in a .ts file, and still finds a hook there", () => {
        const route = `
          export async function GET(request) { const ids = new Set(request.ids); return Response.json([...ids]); }
          export const POST = async (request) => Object.fromEntries(await request.formData());
          export function Format(rows) { return new Map(rows); }
          export function useIndex(rows) { return new Map(rows); }`;
        expect(fingerprints(route, "app/routes/api.ts")).toEqual(["app/routes/api.ts::useIndex::render-index::Map::"]);
        expect(scan(`export function GET(request) { const ids = new Set(request.ids); return null; }`, "app/routes/api.tsx")).toEqual([]);
        expect(fingerprints(`export function C({ rows }) { const byId = new Map(rows); return byId.size; }`)).toEqual(["app/routes/fixture.tsx::C::render-index::Map::byId"]);
    });
    it("leaves a callback that runs during render uncounted, a known gap", () => {
        expect(scan(`export function Rows({ rows }) { return rows.map((row) => new Set(row.tags).size); }`)).toEqual([]);
    });
    it("reads through as and satisfies, an anonymous class component, and skips a static block, a nameless default export and an empty builder", () => {
        const source = `
          import { memo, Component } from "react";
          export const Rows = memo((({ rows }) => { const byId = new Map(rows) as Map<string, unknown>; const kinds = new Set(rows) satisfies Set<unknown>; return byId.size + kinds.size; }) as any) satisfies object;
          export const Table = class extends Component { render() { return new Set(this.props.rows).size; } };
          export function Empty() { const seen = new Map; const none = Object.fromEntries(); return seen.size; }
          export default function (rows) { return new Set(rows); }
          export class Cache { static { const warm = new Map([[1, 2]]); } }`;
        expect(fingerprints(source)).toEqual([
            "app/routes/fixture.tsx::Rows::render-index::Map::byId",
            "app/routes/fixture.tsx::Rows::render-index::Set::kinds",
            "app/routes/fixture.tsx::Table::render-index::Set::",
        ]);
        expect(fingerprints(`export default class extends Component { render() { return new Set(this.props.rows).size; } }`)).toEqual([
            "app/routes/fixture.tsx::render::render-index::Set::",
        ]);
    });
    it("never makes the component around it a hand-rolled control at its call sites", () => {
        const offenders = scanFiles({
            "app/components/rows.tsx": `export function Rows({ rows }) { const byId = new Map(rows); return byId.size; }`,
            "app/routes/home.tsx": `import { Rows } from "~/components/rows"; export function Home() { return <Rows rows={[]} />; }`,
        });
        expect(offenders.map((offender) => offender.category)).toEqual(["render-index"]);
    });
    it("names the store, useMemo and module-scope fix in its message", () => {
        const comparison = compareWithBaseline([{ fingerprint: "app/x.tsx::Rows::render-index::Map::byId", file: "app/x.tsx", line: 4 }], {});
        expect(formatComparison(comparison)).toEqual([`New index built in render: app/x.tsx::Rows::render-index::Map::byId (+1) at app/x.tsx:4. ${RENDER_INDEX_FIX}`]);
        expect(RENDER_INDEX_FIX).toContain("in the store or loader that holds the data");
        expect(RENDER_INDEX_FIX).toContain("useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows])");
        expect(RENDER_INDEX_FIX).toContain("module scope");
    });
});
describe("layout-animation", () => {
    const layout = (source, file) => scan(source, file).filter((offender) => offender.category === "layout-animation").map((offender) => offender.fingerprint);
    it("finds transition-all and a transition of a layout property in a class, under any variant, counted where it is written", () => {
        expect(scan(`export function Panel() { return <div className="rounded-md transition-all duration-200" />; }`)).toEqual([
            { category: "layout-animation", fingerprint: "app/routes/fixture.tsx::Panel::layout-animation::transition-all::", file: "app/routes/fixture.tsx", line: 1 },
        ]);
        const source = `
          const popover = "data-open:!transition-[width,opacity] md:transition-[max-height]";
          const menu = \`[transition:top_200ms_ease,opacity_200ms] \${"x"} [transition-property:margin-left]\`;
          const tooltip = "[transition:150ms_ease-out]";
          export const Menu = () => <div className={popover + menu + tooltip} />;`;
        expect(layout(source)).toEqual([
            "app/routes/fixture.tsx::(module)::layout-animation::data-open:!transition-[width,opacity]::",
            "app/routes/fixture.tsx::(module)::layout-animation::md:transition-[max-height]::",
            "app/routes/fixture.tsx::(module)::layout-animation::[transition:top_200ms_ease,opacity_200ms]::",
            "app/routes/fixture.tsx::(module)::layout-animation::[transition-property:margin-left]::",
            "app/routes/fixture.tsx::(module)::layout-animation::[transition:150ms_ease-out]::",
        ]);
    });
    it("passes a class that animates only transform, opacity or colour, and Tailwind's plain transition", () => {
        const source = `export function Popover() {
          return <div className="transition transition-colors transition-opacity transition-transform transition-[opacity,translate,scale] [transition:transform_var(--d)_var(--e),opacity_var(--d)] [transition-property:translate,scale] [transition:none] data-ending-style:opacity-0 w-64 h-auto top-2" />;
        }`;
        expect(layout(source)).toEqual([]);
    });
    it("finds a transition style value, an element's animate() keyframes and Motion's animate, exit and while props", () => {
        const source = `
          import { motion } from "motion/react";
          export function Drawer({ el, open }) {
            el.style.transition = "height 200ms ease";
            el.style.transitionProperty = "opacity, padding-top";
            el.animate([{ opacity: 0 }, { maxHeight: "0px" }], 200);
            el.animate({ "margin-top": [0, 8] }, 200);
            return <motion.div style={{ transition: "all 0.2s", WebkitTransition: "left .2s" }} animate={{ width: open ? 240 : 0 }} exit={{ height: 0 }} whileHover={{ fontSize: "2rem" }} />;
          }`;
        expect(layout(source)).toEqual([
            "app/routes/fixture.tsx::Drawer::layout-animation::style.transition:height::",
            "app/routes/fixture.tsx::Drawer::layout-animation::style.transitionProperty:padding-top::",
            "app/routes/fixture.tsx::Drawer::layout-animation::animate():max-height::",
            "app/routes/fixture.tsx::Drawer::layout-animation::animate():margin-top::",
            "app/routes/fixture.tsx::Drawer::layout-animation::style.transition:all::",
            "app/routes/fixture.tsx::Drawer::layout-animation::style.WebkitTransition:left::",
            "app/routes/fixture.tsx::Drawer::layout-animation::animate:width::",
            "app/routes/fixture.tsx::Drawer::layout-animation::exit:height::",
            "app/routes/fixture.tsx::Drawer::layout-animation::whileHover:font-size::",
        ]);
    });
    it("passes transform and opacity in styles, keyframes and Motion, and strings that only look alike", () => {
        const source = `
          import { motion } from "motion/react";
          const base = { opacity: 0 };
          const key = "width";
          export function Sheet({ el, frames }) {
            el.style.transition = "transform 200ms, opacity 200ms";
            el.style.transform += "translateY(0)";
            el.animate([base, frames, { ...base, [key]: 1, translate: "0 8px", "object-position": "50% 0%" }], 200);
            el.animate();
            el.show({ height: 0 });
            const copy = { "transition": "width" ? "a" : "b", [key]: "transition: width 1s" };
            return <motion.div style={{ transition: "opacity .2s", width: 240 }} animate="open" initial={{ height: 0 }} exit={/* later */} whileTap={{ scale: 0.96 }} title=" transition with  width " />;
          }`;
        expect(layout(source)).toEqual([]);
    });
    it("finds a stylesheet's transition of a layout property or all, @apply transition-all, and keyframes that set a layout property", () => {
        const css = `
          .popover { transition: opacity 150ms, height 150ms; }
          .menu { transition-property: inset-inline-start; }
          @media (hover: hover) { .tooltip:hover { -webkit-transition: .2s; } }
          .card { @apply  rounded transition-all; }
          @keyframes grow { from { opacity: 0; width: 0; } to { width: 100%; height: 4rem; } }
          @-webkit-keyframes slide { to { LEFT: 0; } }`;
        expect(layout(css, "app/app.css")).toEqual([
            "app/app.css::(stylesheet)::layout-animation::.popover::transition: height",
            "app/app.css::(stylesheet)::layout-animation::.menu::transition-property: inset-inline-start",
            "app/app.css::(stylesheet)::layout-animation::.tooltip:hover::-webkit-transition: all",
            "app/app.css::(stylesheet)::layout-animation::.card::@apply transition-all",
            "app/app.css::(stylesheet)::layout-animation::@keyframes grow::width",
            "app/app.css::(stylesheet)::layout-animation::@-webkit-keyframes slide::left",
        ]);
    });
    it("passes a stylesheet that animates transform, opacity and colours only", () => {
        const css = `
          .popover { transition: transform 150ms cubic-bezier(0.2, 0, 0, 1), opacity 150ms; transition-property: opacity, background-color,; }
          .press { transition: none; @apply transition-opacity; }
          @keyframes ouro-spin { to { rotate: 1turn; } }
          @keyframes shimmer { from { background-position: 100% 0; } }`;
        expect(layout(css, "app/app.css")).toEqual([]);
    });
    it("reads a transition value as a shorthand or a property list", () => {
        expect(layoutTransitionProperty("200ms ease-in-out 50ms")).toBe("all");
        expect(layoutTransitionProperty("200ms ease-in-out 50ms", { list: true })).toBe(undefined);
        expect(layoutTransitionProperty("var(--duration) var(--ease)")).toBe(undefined);
        expect(layoutTransitionProperty("opacity steps(4, end), Gap 1s")).toBe("gap");
        expect(layoutTransitionProperty("border-inline-start-width 1s linear(0, 1)")).toBe("border-inline-start-width");
        expect(layoutAnimationClass("hover:transition-all!")).toBe("all");
        expect(layoutAnimationClass("transition-[grid-template-columns]")).toBe("grid-template-columns");
        expect(layoutAnimationClass("transition-shadow")).toBe(undefined);
    });
    it("reads a shorthand of keywords only, or with a zero or missing duration, as naming no property", () => {
        for (const value of ["unset", "initial", "inherit", "revert", "revert-layer", "none", "0s", "0ms ease", "all 0s", "height 0.0s 200ms", "height", "ease-in"]) {
            expect(layoutTransitionProperty(value)).toBe(undefined);
        }
        expect(layoutTransitionProperty("opacity 0s, height 200ms")).toBe("height");
        expect(layoutTransitionProperty("height var(--duration)")).toBe("height");
        expect(layoutTransitionProperty("height", { list: true })).toBe("height");
        expect(layoutAnimationClass("[transition:unset]")).toBe(undefined);
        expect(layoutAnimationClass("[transition:0s]")).toBe(undefined);
        expect(layout(`.reset { transition: initial; } .instant { transition: width 0s; }`, "app/app.css")).toEqual([]);
    });
    it("never makes the component around it a hand-rolled control at its call sites", () => {
        const offenders = scanFiles({
            "app/components/panel.tsx": `export function Panel() { return <div className="transition-all" />; }`,
            "app/routes/home.tsx": `import { Panel } from "~/components/panel"; export function Home() { return <Panel />; }`,
        });
        expect(offenders.map((offender) => offender.category)).toEqual(["layout-animation"]);
    });
    it("names transform and opacity in its message", () => {
        const comparison = compareWithBaseline([{ fingerprint: "app/x.tsx::Menu::layout-animation::transition-all::", file: "app/x.tsx", line: 4 }], {});
        expect(formatComparison(comparison)).toEqual([`New animation of a layout property: app/x.tsx::Menu::layout-animation::transition-all:: (+1) at app/x.tsx:4. ${LAYOUT_ANIMATION_FIX}`]);
        expect(LAYOUT_ANIMATION_FIX).toContain("Animate transform and opacity instead, which the compositor runs without layout");
        expect(LAYOUT_ANIMATION_FIX).toContain("rather than transition-all");
    });
});
describe("vague-failure-copy", () => {
    const vague = (source, options) => findOffendersInSource("app/routes/fixture.tsx", source, options)
        .filter((offender) => offender.category === "vague-failure-copy")
        .map((offender) => offender.fingerprint.split("::").slice(3).join("::"));
    it("keeps the detector Ouro AX shares: six phrases and the bare failure pattern", () => {
        expect(VAGUE_FAILURE_PHRASES.map(([name]) => name)).toEqual(["couldn't", "could not", "something went wrong", "unable to", "failed to load", "an error occurred"]);
        const samples = {
            "Couldn’t show this picture": "couldn't",
            "Couldnt save": "couldn't",
            "We COULD NOT reach the server": "could not",
            "Something went wrong.": "something went wrong",
            "Unable to sync": "unable to",
            "Photos failed to load": "failed to load",
            "An error occurred": "an error occurred",
            "An unexpected error has occurred.": "an error occurred",
            "A error occurred": "an error occurred",
            "Sorry, an unknown error": "an error occurred",
            "Error": "bare error",
            "Errors": "bare error",
            "  Error!  ": "bare error",
            "Error:": "bare error",
            "Upload failed": "bare failed",
            "Payment failure": "bare failed",
            "Terror failed": "bare failed",
            "Couldn't send.": "couldn't",
            "Couldn't send:": "couldn't",
            "Error: something went wrong": "something went wrong",
            "Sync errors": "bare error",
            // A cause in the same sentence, of two words or a substitution, that is not a next step or a vague word.
            "Couldn't send: try again.": "couldn't",
            "Something went wrong: please try again later.": "something went wrong",
            "Something went wrong. Error code: E42": "something went wrong",
            "Unable to save - try again": "unable to",
            "Couldn't send: error": "couldn't",
            "Couldn't sync since yesterday": "couldn't",
            "Couldn't send: you're offline. Could not retry.": "could not",
            "Error: error": "bare error",
            "Error: please try again": "bare error",
            "Upload failed: try again": "bare failed",
        };
        for (const [text, phrase] of Object.entries(samples))
            expect([text, vagueFailurePhrase(text)]).toEqual([text, phrase]);
        for (const text of ["3 failed", "Sync failed again", "The upload to the photo service failed", "Could nothing be simpler", "unable tomorrow", "Error: the photo service says this picture was deleted", "Couldn't send: you're offline. Try again when you're back online.", "Could not save because the server refused it", "Upload failed - the server answered 413", "Something went wrong — the server answered 500", "Couldn't send: ${…}", "No errors", "Nothing failed", "Zero errors", "None failed", "Show errors", "Hide errors", "Retry failed", "Clear errors"])
            expect([text, vagueFailurePhrase(text)]).toEqual([text, undefined]);
        expect(vagueFailurePhrase("Failed", { whole: false })).toBe(undefined);
        expect(vagueFailurePhrase("Could not save", { whole: false })).toBe("could not");
        expect(BARE_FAILURE.flags).toBe("iu");
    });
    it("reads JSX text with the children after it, so a cause in an expression counts as in its template twin", () => {
        expect(vague(`export function A({ why }) { return <>
          <p>Couldn't send: {why}</p>
          <p>Couldn't send: <b>{why}</b></p>
          <p>Couldn't send:{/* the reason */} {why}</p>
          <p>Couldn't send {why}</p>
          <p>Error: {why}</p>
          <p>Error: try again {why}</p>
        </>; }`)).toEqual(["couldn't::Couldn't send ${…}"]);
    });
    it("finds a vague phrase in a string, a template literal's static parts and JSX text, counted where it is written", () => {
        expect(scan(`export function Photo() {\n  return <p>Couldn't show this picture</p>;\n}`)).toEqual([
            { category: "vague-failure-copy", fingerprint: "app/routes/fixture.tsx::Photo::vague-failure-copy::couldn't::Couldn't show this picture", file: "app/routes/fixture.tsx", line: 2 },
        ]);
        expect(vague(`
      export const message = "Something went wrong";
      export function Upload({ name, toast }) {
        toast(\`Could not upload \${name}. Try again later\`);
        throw new Error(\`Unable to read the file\`);
        return <Alert title="Photos failed to load" description={'An error occurred'}>
          We   could not
          reach the server.
        </Alert>;
      }`)).toEqual([
            "something went wrong::Something went wrong",
            "could not::Could not upload ${…}. Try again later",
            "unable to::Unable to read the file",
            "failed to load::Photos failed to load",
            "an error occurred::An error occurred",
            "could not::We could not reach the server.",
        ]);
    });
    it("counts a bare failure only as a whole text: not a count, a template with a substitution or JSX text beside other children", () => {
        expect(vague(`export function Status({ n, ok }) { return <>
          <Badge>Error</Badge>
          <Badge>{ok ? "Done" : "Upload failed"}</Badge>
          <Badge label="Error:" />
          <Badge>
            {/* the state */}
            Failed
          </Badge>
          <Badge>Error <b>{n}</b> again</Badge>
          <Badge>{n} failed</Badge>
          <Badge>{\`\${n} failed\`}</Badge>
          <Badge>Error <b>{n}</b></Badge>
          <Badge>{"3 failed"}</Badge>
        </>; }`)).toEqual(["bare error::Error", "bare failed::Upload failed", "bare error::Error:", "bare failed::Failed"]);
    });
    it("reads apostrophe entities and curly apostrophes as an apostrophe", () => {
        expect(vague(`export function A() { return <>
          <p>Couldn&apos;t sync</p>
          <p title="Couldn&#39;t sync">Couldn&rsquo;t sync</p>
          <p>{"Couldn’t sync"}</p>
        </>; }`)).toEqual(["couldn't::Couldn't sync", "couldn't::Couldn't sync", "couldn't::Couldn't sync", "couldn't::Couldn’t sync"]);
    });
    it("skips strings that are not copy: specifiers, types, keys, tagged templates, compared values, non-copy attributes and properties, and one lowercase token", () => {
        expect(vague(`
      import "./could not.css";
      import messages from "./unable to";
      export { failed } from "./failed to load";
      import fs = require("could not");
      type Failure = "Something went wrong" | import("unable to").T;
      declare module "could not" {}
      const lazy = () => import("./couldn't");
      const config = require("./could not");
      const keys = { "Could not": 1, ["Unable to"]: 2, className: "Error", id: "Upload failed", type: "Failed to load" };
      enum Status { "Error" = 1 }
      interface Strings { "Something went wrong": string }
      export function A({ status, styles, m }) {
        if (status === "Error" || status !== "Failed") return m["Could not"];
        switch (status) { case "Something went wrong": break; }
        const sheet = css\`could not\`;
        setStatus("error");
        setStatus("load-failed");
        return <div className={status ? "Error" : "x"} itemClassName="Failed" data-state="Upload failed" id="Error" key="Failed" type="Error"
          href="/could not" src="unable to" to="Error" name="Error" role="Error" htmlFor="Error" as="Error" />;
      }`)).toEqual([]);
    });
    it("counts copy in a handler, under an element, at the top level and in a computed property's value", () => {
        expect(vague(`
      const title = { [key]: "Could not save" };
      export function A({ toast }) {
        return <div className={() => "Unable to save"}><Button onPress={() => toast("Couldn't save")}>{"Error"}</Button></div>;
      }`)).toEqual(["could not::Could not save", "unable to::Unable to save", "couldn't::Couldn't save", "bare error::Error"]);
    });
    it("never makes the component around failure copy a hand-rolled control at its call sites", () => {
        const offenders = scanFiles({
            "app/components/oops.tsx": `export function Oops() { return <p>Something went wrong</p>; }`,
            "app/routes/home.tsx": `import { Oops } from "~/components/oops"; export function Home() { return <Oops />; }`,
        });
        expect(offenders.map((offender) => offender.category)).toEqual(["vague-failure-copy"]);
    });
    it("lets a text through that holds a failureCopyAllow match, case-sensitive", () => {
        const source = `export function A() { return <>
          <p>The card service says your card could not be charged. Use another card.</p>
          <p>The Card Service says your card could not be charged.</p>
          <p>Could not save</p>
        </>; }`;
        const failureCopyAllow = [{ match: "card service says your card could not be charged", reason: "names the service and its answer" }];
        expect(vague(source, { failureCopyAllow })).toEqual(["could not::The Card Service says your card could not be charged.", "could not::Could not save"]);
        expect(vague(source)).toHaveLength(3);
        const files = { "app/a.tsx": source };
        const found = findOffenders(["app/a.tsx"], { root: "/repo", readFile: (file) => files[path.relative("/repo", file)], paths: {}, failureCopyAllow });
        expect(found).toHaveLength(2);
    });
    it("names the phrase and what to say instead in its message", () => {
        const fingerprint = "app/x.tsx::Photo::vague-failure-copy::couldn't::Couldn't show this picture";
        const comparison = compareWithBaseline([{ fingerprint, file: "app/x.tsx", line: 4 }], {});
        expect(formatComparison(comparison)).toEqual([
            `New vague failure copy ("couldn't"): ${fingerprint} (+1) at app/x.tsx:4. "couldn't" doesn't say what failed or why. ${VAGUE_FAILURE_COPY_FIX}`,
        ]);
        expect(VAGUE_FAILURE_COPY_FIX).toContain('"The photo service says this picture was deleted by its owner."');
        expect(VAGUE_FAILURE_COPY_FIX).toContain("who or what caused it");
        expect(VAGUE_FAILURE_COPY_FIX).toContain("the next step as a working action or command");
        expect(VAGUE_FAILURE_COPY_FIX).toContain("failureCopyAllow in ouro-source-rules.json with a reason");
    });
    it("stops on a failureCopyAllow that is not a list, or an entry with an empty match or no reason, naming the entry and the fix", () => {
        const load = (failureCopyAllow) => loadConfig("/repo", { readFile: () => JSON.stringify({ failureCopyAllow }), readdir: () => [] });
        const entry = { match: "could not be charged", reason: "names the service and its answer" };
        expect(load([entry]).failureCopyAllow).toEqual([entry]);
        expect(loadConfig("/repo", { readFile: () => "{}", readdir: () => [] }).failureCopyAllow).toEqual([]);
        expect(() => load({ match: "x" })).toThrow(`${CONFIG_PATH}: failureCopyAllow must be a list. Fix: "failureCopyAllow": [{ "match": "<part of the text>", "reason": "<why this wording is precise>" }].`);
        expect(() => load([entry, { match: "could not" }])).toThrow(`${CONFIG_PATH}: failureCopyAllow[1] {"match":"could not"} needs a non-empty "match" (part of the text) and a "reason" (why this wording is precise). Fix: { "match": "<part of the text>", "reason": "<why this wording is precise>" }.`);
        for (const bad of [{ match: "could not", reason: " " }, { match: "", reason: "precise" }, { reason: "precise" }, "could not", null])
            expect(() => load([bad])).toThrow(`${CONFIG_PATH}: failureCopyAllow[0] ${JSON.stringify(bad)} needs a non-empty "match"`);
    });
    it("counts a new failureCopyAllow match as a narrowing, once, unless a match at the base is part of it", () => {
        const config = (...matches) => ({ src: "app", ouroDirs: [], exclude: [], hookPrefix: "", baseline: BASELINE_PATH, failureCopyAllow: matches.map((match) => ({ match, reason: "precise" })) });
        expect(narrowedSettings(config(), config("could not be charged", "could not be charged"))).toEqual([
            { fingerprint: `${CONFIG_PATH}::failureCopyAllow::could not be charged`, change: 'lets failure copy holding "could not be charged" through (failureCopyAllow)' },
        ]);
        expect(narrowedSettings(config("could not"), config("card could not be charged"))).toEqual([]);
        expect(narrowedSettings(config("could not be charged"), config())).toEqual([]);
    });
});
describe("third-party-control", () => {
    it("keeps the library list in one constant", () => {
        expect(THIRD_PARTY_CONTROL_PACKAGES).toEqual([
            "@headlessui/react",
            "@radix-ui/*",
            "@base-ui-components/*",
            "@base-ui/*",
            "react-aria-components",
            "react-aria",
            "@ariakit/*",
            "@mui/*",
            "@chakra-ui/*",
            "vaul",
            "cmdk",
            "sonner",
        ]);
    });
    each([
        "@headlessui/react",
        "@radix-ui/react-dialog",
        "@base-ui-components/react",
        "@base-ui/react/button",
        "react-aria-components",
        "react-aria",
        "react-aria/i18n",
        "@ariakit/react",
        "@mui/material/Button",
        "@chakra-ui/react",
        "vaul",
        "cmdk",
        "sonner",
    ])("treats %s as a UI-control library", (specifier) => {
        expect(isThirdPartyControlModule(specifier)).toBe(true);
    });
    each([
        "@headlessui/vue",
        "@radix-ui",
        "@muix/grid",
        "react-aria-extras",
        "sonnerish",
        "react-router",
        "lucide-react",
        "~/components/ouro/button/button",
    ])("does not treat %s as a UI-control library", (specifier) => {
        expect(isThirdPartyControlModule(specifier)).toBe(false);
    });
    it("finds a named import, tagged with its package and imported name", () => {
        const source = `
      import { Dialog, DialogPanel } from "@headlessui/react";
      export function Sheet() { return <Dialog><DialogPanel aria-label="Sheet" /></Dialog>; }`;
        expect(scan(source)).toEqual([
            {
                category: "third-party-control",
                fingerprint: "app/routes/fixture.tsx::Sheet::third-party-control::@headlessui/react.Dialog::",
                file: "app/routes/fixture.tsx",
                line: 3,
            },
            {
                category: "third-party-control",
                fingerprint: "app/routes/fixture.tsx::Sheet::third-party-control::@headlessui/react.DialogPanel::aria-label=Sheet",
                file: "app/routes/fixture.tsx",
                line: 3,
            },
        ]);
    });
    it("finds a namespace import, by its members", () => {
        const source = `
      import * as Headless from "@headlessui/react";
      import * as Dialog from "@radix-ui/react-dialog";
      export function Menu() {
        return <>
          <Headless.Button type="button" />
          <Headless.Menu.Items />
          <Dialog.Root />
          <Headless />
        </>;
      }`;
        expect(fingerprints(source)).toEqual([
            "app/routes/fixture.tsx::Menu::third-party-control::@headlessui/react.Button::type=button",
            "app/routes/fixture.tsx::Menu::third-party-control::@headlessui/react.Menu.Items::",
            "app/routes/fixture.tsx::Menu::third-party-control::@radix-ui/react-dialog.Root::",
        ]);
    });
    it("finds aliased imports: renamed, default, and same-file aliases", () => {
        const source = `
      import { Drawer as Sheet } from "vaul";
      import Toaster from "sonner";
      import { Menu } from "@base-ui/react/menu";
      import * as Aria from "react-aria-components";
      const Trigger = Menu.Trigger;
      const Again = Trigger;
      const Field = Aria . TextField;
      const Loop = Cycle;
      const Cycle = Loop;
      const Plain = Other.Thing;
      export function Panel() {
        return <>
          <Sheet.Content />
          <Toaster />
          <Again />
          <Field name="title" />
          <Loop />
          <Plain />
        </>;
      }`;
        expect(fingerprints(source)).toEqual([
            "app/routes/fixture.tsx::Panel::third-party-control::vaul.Drawer.Content::",
            "app/routes/fixture.tsx::Panel::third-party-control::sonner.default::",
            "app/routes/fixture.tsx::Panel::third-party-control::@base-ui/react/menu.Menu.Trigger::",
            "app/routes/fixture.tsx::Panel::third-party-control::react-aria-components.TextField::name=title",
        ]);
    });
    it("does not count type-only imports, hooks or Ouro components", () => {
        const source = `
      import type { Button } from "@headlessui/react";
      import type * as Radix from "@radix-ui/react-dialog";
      import { type Menu, useClose } from "@headlessui/react";
      import "@radix-ui/themes/styles.css";
      import { Button as HxButton } from "~/components/ouro/button/button";
      import { Checkbox } from "~/components/ouro/checkbox/checkbox";
      export function Actions() {
        const close = useClose();
        return <>
          <Button />
          <Menu />
          <Radix.Root />
          <HxButton type="button" onClick={close}>Save</HxButton>
          <Checkbox name="done" />
        </>;
      }`;
        expect(scan(source)).toEqual([]);
    });
    it("counts a third-party control alongside its other offences", () => {
        const source = `
      import * as Headless from "@headlessui/react";
      export function Theme() { return <Headless.MenuItems className="focus:outline-none" />; }`;
        expect(fingerprints(source)).toEqual([
            "app/routes/fixture.tsx::Theme::third-party-control::@headlessui/react.MenuItems::",
            "app/routes/fixture.tsx::Theme::control-state-style::@headlessui/react.MenuItems::",
        ]);
    });
});
describe("motion elements", () => {
    it("treats motion's element components as the intrinsic element they render", () => {
        const source = `
      import { m, motion as M, Reorder, AnimatePresence } from "motion/react";
      import type { motion as TypeOnly } from "motion/react";
      import * as mm from "motion/react-m";
      import * as Whole from "motion/react";
      import { motion } from "framer-motion";
      import { m as icon } from "lucide-react";
      const MotionButton = motion.create("button");
      const Old = M("a");
      const NotMotion = other.create("button");
      const Created = m.create(Thing);
      const Named = M.create.call(null, "button");
      export function Moving({ go }) {
        return <>
          <m.button type="button" />
          <M.a href="/" />
          <motion.div onClick={go} />
          <mm.li whileTap={{ scale: 0.9 }} />
          <m.div drag="x" />
          <m.span onPanStart={go} />
          <m.div whileFocus={{}} onTapStart={go} />
          <m.div whileHover={{ scale: 1.02 }} layout />
          <div whileTap={{}} />
          <icon.div onClick={go} />
          <Whole.div onClick={go} />
          <AnimatePresence />
          <AnimatePresence.Child onClick={go} />
          <m.Custom onClick={go} />
          <Reorder.Group values={[]} onReorder={go} />
          <Reorder.Item value={1} />
          <Reorder.Item as="div" value={2} />
          <Reorder.Other />
          <MotionButton whileTap={{}} />
          <Old />
          <NotMotion />
          <Created />
          <Named />
        </>;
      }`;
        expect(fingerprints(source)).toEqual([
            "app/routes/fixture.tsx::Moving::raw-button::button::type=button",
            "app/routes/fixture.tsx::Moving::raw-anchor::a::",
            "app/routes/fixture.tsx::Moving::plain-element-handler::div::",
            "app/routes/fixture.tsx::Moving::plain-element-handler::li::",
            "app/routes/fixture.tsx::Moving::plain-element-handler::div::",
            "app/routes/fixture.tsx::Moving::plain-element-handler::span::",
            "app/routes/fixture.tsx::Moving::plain-element-handler::div::",
            "app/routes/fixture.tsx::Moving::plain-element-handler::li::",
            "app/routes/fixture.tsx::Moving::plain-element-handler::div::",
            "app/routes/fixture.tsx::Moving::raw-button::button::",
            "app/routes/fixture.tsx::Moving::raw-anchor::a::",
        ]);
    });
});
describe("string tags", () => {
    it("resolves string-typed dynamic tags, as props and createElement calls", () => {
        const source = `
      import React, { createElement } from "react";
      const Tag = "button";
      const Heading = "h2";
      export function Dynamic({ href, as: As = "a", go, x }) {
        const Wrapper = href ? "a" : "div";
        const select = document.createElement("select");
        return <>
          <Tag type="submit" />
          <Wrapper onClick={go} />
          <As />
          <Heading tabIndex={2} />
          {createElement("button", { type: "button", onClick: go })}
          {React.createElement("div", { onKeyDown: go, role: "button", [x]: 1, ...x })}
          {createElement(Tag, null)}
          {createElement("input", { type: "hidden", name: "id" })}
          {createElement("span", { "data-ouro": "x" })}
          {createElement(Component, {})}
          {createElement()}
          {createElement(\`b\${x}\`)}
          <Card as="button" onClick={go} />
          <Card as={href ? "a" : undefined} />
          <Card as={("select")} />
          <Card as={"textarea" as const} />
          <Card as={"details" satisfies string} />
          <Card as={(x ?? "summary")!} />
          <Card as={x || "button"} />
          <Card as={x && "button"} />
          <Card as={} />
          <Card as="section" />
        </>;
      }`;
        expect(fingerprints(source)).toEqual([
            "app/routes/fixture.tsx::Dynamic::raw-select::select::",
            "app/routes/fixture.tsx::Dynamic::raw-button::button::type=submit",
            "app/routes/fixture.tsx::Dynamic::raw-anchor::a::",
            "app/routes/fixture.tsx::Dynamic::plain-element-handler::div::",
            "app/routes/fixture.tsx::Dynamic::raw-anchor::a::",
            "app/routes/fixture.tsx::Dynamic::positive-tabindex::h2::",
            "app/routes/fixture.tsx::Dynamic::raw-button::button::type=button",
            "app/routes/fixture.tsx::Dynamic::plain-element-handler::div::role=button",
            "app/routes/fixture.tsx::Dynamic::interactive-role::div::role=button",
            "app/routes/fixture.tsx::Dynamic::raw-button::button::",
            "app/routes/fixture.tsx::Dynamic::data-ouro-attr::span[data-ouro]::",
            "app/routes/fixture.tsx::Dynamic::raw-button::button::",
            "app/routes/fixture.tsx::Dynamic::raw-anchor::a::",
            "app/routes/fixture.tsx::Dynamic::raw-select::select::",
            "app/routes/fixture.tsx::Dynamic::raw-textarea::textarea::",
            "app/routes/fixture.tsx::Dynamic::details-summary::details::",
            "app/routes/fixture.tsx::Dynamic::details-summary::summary::",
            "app/routes/fixture.tsx::Dynamic::raw-button::button::",
        ]);
    });
    it("records createElement props the way JSX props are recorded", () => {
        const source = `function Made({ label, disabled }) {
      return createElement("button", { "aria-label": label, disabled, name: "go" });
    }`;
        expect(fingerprints(source)).toEqual([
            "app/routes/fixture.tsx::Made::raw-button::button::name=go,aria-label={label}",
        ]);
    });
});
describe("call sites", () => {
    const files = {
        "app/components/navigation/app-link.tsx": `export function Link({ href }) { return <a href={href} />; }`,
        "app/components/navigation/index.ts": [
            `export { Link as AppLink } from "./app-link";`,
            `export * from "./safe";`,
            `export * from "@radix-ui/react-dialog";`,
            `export * as everything from "./safe";`,
            `export * as Dialog from "@radix-ui/react-dialog";`,
            `export * as Raws from "./app-link";`,
            `export type { Hidden } from "./safe";`,
            `export { type Hidden2, Safe as SafeAgain } from "./safe";`,
        ].join("\n"),
        "app/components/navigation/safe.tsx": `export function Safe() { return <p />; }`,
        "app/components/dialog.tsx": [
            `export { Root as DialogRoot } from "@radix-ui/react-dialog";`,
            `import * as Tabs from "@radix-ui/react-tabs";`,
            `export const TabList = Tabs.List;`,
            `import { Popover } from "@headlessui/react";`,
            `import { Link as Imported } from "./navigation/app-link";`,
            `import * as Ns from "./navigation/app-link";`,
            `export { Popover, Imported, Ns, Tabs };`,
            `export default function Fancy() { return <Inner />; }`,
            `function Inner() { return <button />; }`,
            `export const Plain = () => <p />, Count = 1, { destructured } = {};`,
            `export class Legacy { render() { return <select />; } }`,
            `function Field() { return <input name="q" />; }`,
            `export { Field as SearchField };`,
        ].join("\n"),
        "app/components/def.tsx": `function Thing() { return <textarea />; }\nexport default Thing;`,
        "app/components/anon.tsx": `export default () => <button />;`,
        "app/components/anon-fn.tsx": `export default function () { return <details />; }`,
        "app/components/cycle-a.ts": `export * from "./cycle-b";`,
        "app/components/cycle-b.ts": `export * from "./cycle-a";`,
        "app/routes/page.tsx": [
            `import { Link } from "~/components/navigation/app-link";`,
            `import { AppLink, Safe, Trigger, SafeAgain, Dialog, Raws, everything } from "~/components/navigation";`,
            `import * as Nav from "../components/navigation/app-link";`,
            `import Fancy, { DialogRoot, TabList, Popover, Plain, Legacy, SearchField, Imported, Ns, Tabs } from "#dialog";`,
            `import Thing from "~/components/def";`,
            `import Anon from "~/components/anon";`,
            `import AnonFn from "~/components/anon-fn";`,
            `import { Nothing } from "~/components/cycle-a";`,
            `import { Button } from "~/components/ouro/button/button";`,
            `import { Missing } from "./missing";`,
            `import { Form } from "react-router";`,
            `const Alias = Link;`,
            `export function Page() {`,
            `  return <>`,
            `    <Link href="/a" />`,
            `    <Link href="/b" />`,
            `    <AppLink href="/c" />`,
            `    <Nav.Link href="/d" />`,
            `    <Alias href="/e" />`,
            `    <Link className="focus:ring" href="/f" />`,
            `    <Safe /><SafeAgain /><Plain /><Nav /><Link.Sub /><Nothing /><Missing />`,
            `    <Trigger />`,
            `    <Fancy />`,
            `    <DialogRoot />`,
            `    <TabList />`,
            `    <Popover />`,
            `    <Legacy />`,
            `    <SearchField />`,
            `    <Imported />`,
            `    <Ns.Link />`,
            `    <Thing />`,
            `    <Anon />`,
            `    <AnonFn />`,
            `    <Button className="focus:ring" />`,
            `    <Form className="focus:ring" />`,
            `    <Missing className="focus:ring" />`,
            `    <Dialog.Root />`,
            `    <Raws.Link />`,
            `    <Tabs.Trigger />`,
            `    <Dialog /><everything.Safe /><everything.Nope />`,
            `  </>;`,
            `}`,
        ].join("\n"),
    };
    it("counts each use of an app component that hand-rolls a control, and re-exported third-party controls", () => {
        const page = scanFiles(files).filter((offender) => offender.file === "app/routes/page.tsx");
        expect(page.map((offender) => `${offender.line} ${offender.fingerprint}`)).toEqual([
            "15 app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/navigation/app-link#Link::",
            "16 app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/navigation/app-link#Link::",
            "17 app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/navigation/app-link#Link::",
            "18 app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/navigation/app-link#Link::",
            "19 app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/navigation/app-link#Link::",
            "20 app/routes/page.tsx::Page::control-state-style::app/components/navigation/app-link#Link::",
            "20 app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/navigation/app-link#Link::",
            "22 app/routes/page.tsx::Page::third-party-control::@radix-ui/react-dialog.Trigger::",
            "23 app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/dialog#Fancy::",
            "24 app/routes/page.tsx::Page::third-party-control::@radix-ui/react-dialog.Root::",
            "25 app/routes/page.tsx::Page::third-party-control::@radix-ui/react-tabs.List::",
            "26 app/routes/page.tsx::Page::third-party-control::@headlessui/react.Popover::",
            "27 app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/dialog#Legacy::",
            "28 app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/dialog#Field::",
            "29 app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/navigation/app-link#Link::",
            "30 app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/navigation/app-link#Link::",
            "31 app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/def#Thing::",
            "32 app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/anon#default::",
            "33 app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/anon-fn#default::",
            "34 app/routes/page.tsx::Page::control-state-style::app/components/ouro/button/button#Button::",
            "35 app/routes/page.tsx::Page::control-state-style::react-router.Form::",
            "36 app/routes/page.tsx::Page::control-state-style::app/routes/missing#Missing::",
            "37 app/routes/page.tsx::Page::third-party-control::@radix-ui/react-dialog.Root::",
            "38 app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/navigation/app-link#Link::",
            "39 app/routes/page.tsx::Page::third-party-control::@radix-ui/react-tabs.Trigger::",
        ]);
    });
    it("does not count uses inside the defining module, or across files a second time", () => {
        const dialog = scanFiles(files).filter((offender) => offender.file === "app/components/dialog.tsx");
        expect(dialog.map((offender) => offender.category)).toEqual(["raw-button", "raw-select", "raw-input"]);
    });
    it("scans one file without resolving its imports", () => {
        const source = `import { Link } from "~/components/navigation/app-link";\nexport const A = () => <Link className="focus:ring" />;`;
        expect(fingerprints(source)).toEqual([
            "app/routes/fixture.tsx::A::control-state-style::~/components/navigation/app-link.Link::",
        ]);
    });
    it("loads tsconfig paths, tolerating a missing or path-less tsconfig", () => {
        const read = (text) => () => text;
        expect(loadPaths("/repo", read(`{ "compilerOptions": { "paths": { "~/*": ["./app/*"] } } }`))).toEqual({ "~/*": ["./app/*"] });
        expect(loadPaths("/repo", read(`{ // comment\n "compilerOptions": {} }`))).toEqual({});
        expect(loadPaths("/repo", read(`{}`))).toEqual({});
        expect(loadPaths("/repo", read(`not json`))).toEqual({});
        const missing = () => {
            throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        };
        expect(loadPaths("/repo", missing)).toEqual({});
        const broken = () => {
            throw new Error("EACCES");
        };
        expect(() => loadPaths("/repo", broken)).toThrow("EACCES");
        expect(loadPaths(process.cwd())).toMatchObject({ "@/*": ["./*"] });
    });
});
describe("findRegressions: moves are neutral", () => {
    const at = (fingerprint, line = 1) => ({
        category: fingerprint.split("::")[2],
        fingerprint,
        file: fingerprint.split("::")[0],
        line,
    });
    it("pairs a moved file", () => {
        const result = findRegressions([at("app/components/cook/View.tsx::Panel::raw-button::button::type=button")], {
            "app/routes/recipes.$id.tsx::Panel::raw-button::button::type=button": 1,
        });
        expect(result).toEqual({
            regressions: [],
            moves: [
                {
                    from: "app/routes/recipes.$id.tsx::Panel::raw-button::button::type=button",
                    to: "app/components/cook/View.tsx::Panel::raw-button::button::type=button",
                },
            ],
        });
    });
    it("pairs a renamed component and changed non-literal props, but not changed literal props", () => {
        const result = findRegressions([
            at("app/a.tsx::NewName::raw-button::button::type=button"),
            at("app/a.tsx::A::raw-button::button::aria-label={props.label},type={kind}"),
            at("app/a.tsx::A::raw-button::button::aria-label=Store"),
        ], {
            "app/a.tsx::OldName::raw-button::button::type=button": 1,
            "app/a.tsx::A::raw-button::button::aria-label={label},type={fn(a, { b })}": 1,
            "app/a.tsx::A::raw-button::button::aria-label=Save": 1,
        });
        expect(result.moves).toHaveLength(2);
        expect(result.regressions).toEqual([
            { fingerprint: "app/a.tsx::A::raw-button::button::aria-label=Store", count: 1, at: ["app/a.tsx:1"] },
        ]);
    });
    it("pairs a moved definition at its call sites and a moved stylesheet", () => {
        const result = findRegressions([
            at("app/r.tsx::P::uses-hand-rolled-control::app/components/new/link#Link::"),
            at("app/styles/b.css::(stylesheet)::control-state-style::.app-x[data-current]::after::"),
        ], {
            "app/r.tsx::P::uses-hand-rolled-control::app/components/old/link#Link::": 1,
            "app/styles/a.css::(stylesheet)::control-state-style::.app-x[data-current]::after::": 1,
        });
        expect(result.regressions).toEqual([]);
        expect(result.moves).toHaveLength(2);
    });
    it("pairs only within the same file or the same component", () => {
        const result = findRegressions([
            at("app/b.tsx::Q::raw-button::button::"),
            at("app/a.tsx::Renamed::raw-anchor::a::"),
            at("app/z.tsx::Kept::raw-input::input::"),
            at("app/r.tsx::P::uses-hand-rolled-control::app/components/b#Other::"),
        ], {
            "app/a.tsx::P::raw-button::button::": 1,
            "app/a.tsx::P::raw-anchor::a::": 1,
            "app/y.tsx::Kept::raw-input::input::": 1,
            "app/r.tsx::P::uses-hand-rolled-control::app/components/a#Link::": 1,
        });
        expect(result.regressions.map((regression) => regression.fingerprint)).toEqual([
            "app/b.tsx::Q::raw-button::button::",
        ]);
        expect(result.moves).toHaveLength(3);
    });
    it("still counts a move plus an extra copy, a new tag, a new category and a plain rise", () => {
        const result = findRegressions([
            at("app/b.tsx::P::raw-button::button::", 3),
            at("app/b.tsx::P::raw-button::button::", 7),
            at("app/r.tsx::P::third-party-control::@headlessui/react.Popover::"),
            at("app/a.tsx::P::raw-anchor::a::"),
            at("app/c.tsx::P::raw-input::input::"),
            at("app/c.tsx::P::raw-input::input::", 2),
        ], {
            "app/a.tsx::P::raw-button::button::": 1,
            "app/r.tsx::P::third-party-control::@radix-ui/react-dialog.Root::": 1,
            "app/c.tsx::P::raw-input::input::": 1,
        });
        expect(result.regressions).toEqual([
            { fingerprint: "app/a.tsx::P::raw-anchor::a::", count: 1, at: ["app/a.tsx:1"] },
            { fingerprint: "app/b.tsx::P::raw-button::button::", count: 1, at: ["app/b.tsx:3", "app/b.tsx:7"] },
            { fingerprint: "app/c.tsx::P::raw-input::input::", count: 1, at: ["app/c.tsx:1", "app/c.tsx:2"] },
            { fingerprint: "app/r.tsx::P::third-party-control::@headlessui/react.Popover::", count: 1, at: ["app/r.tsx:1"] },
        ]);
        expect(result.moves).toEqual([{ from: "app/a.tsx::P::raw-button::button::", to: "app/b.tsx::P::raw-button::button::" }]);
    });
});
describe("the ratchet against real changes", () => {
    const rise = (before, after) => findRegressions(scanFiles(after), countFingerprints(scanFiles(before)));
    it("a fix in one component does not pay for a new control in another (the trade)", () => {
        const before = {
            "app/components/recipe/CookSyncStatusLine.tsx": `export function CookSyncStatusLine() { return <button type="button" />; }`,
            "app/routes/shopping-list.tsx": `export default function ShoppingList() { return <p />; }`,
        };
        const after = {
            "app/components/recipe/CookSyncStatusLine.tsx": `export function CookSyncStatusLine() { return <p />; }`,
            "app/routes/shopping-list.tsx": `export default function ShoppingList() { return <button type="button" />; }`,
        };
        expect(rise(before, after)).toEqual({
            regressions: [
                {
                    fingerprint: "app/routes/shopping-list.tsx::ShoppingList::raw-button::button::type=button",
                    count: 1,
                    at: ["app/routes/shopping-list.tsx:1"],
                },
            ],
            moves: [],
        });
    });
    it("a wrapper does not launder a control (NiceLink)", () => {
        const before = { "app/routes/page.tsx": `export function Page() { return <a href="/x">X</a>; }` };
        const after = {
            "app/components/nice.tsx": `export function NiceLink({ href }) { return <a href={href} />; }`,
            "app/routes/page.tsx": `import { NiceLink } from "~/components/nice";\nexport function Page() { return <NiceLink href="/x" />; }`,
        };
        expect(rise(before, after).regressions.map((regression) => regression.fingerprint)).toEqual([
            "app/components/nice.tsx::NiceLink::raw-anchor::a::",
            "app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/nice#NiceLink::",
        ]);
    });
    const usedComponents = {
        "app/components/navigation/app-link.tsx": `export function Link({ href }) { return <a href={href} />; }`,
        "app/components/recipe/SpoonDialog.tsx": `export function SpoonDialog() { return <button type="button" />; }`,
        "app/components/nice.tsx": `import { Link } from "./navigation/app-link";\nexport function NiceLink({ href }) { return <Link href={href} />; }`,
    };
    it("a call site removed in one component does not pay for one added in another (KitchenHome)", () => {
        const kitchen = (cover, row) => ({
            ...usedComponents,
            "app/components/cookbook/KitchenHome.tsx": [
                `import { Link } from "~/components/navigation/app-link";`,
                `import { SpoonDialog } from "~/components/recipe/SpoonDialog";`,
                `export function CookbookCover() { return ${cover}; }`,
                `export function RecipeIndexRow() { return ${row}; }`,
            ].join("\n"),
        });
        expect(rise(kitchen(`<Link href="/c" />`, `<p />`), kitchen(`<p />`, `<SpoonDialog />`))).toEqual({
            regressions: [
                {
                    fingerprint: "app/components/cookbook/KitchenHome.tsx::RecipeIndexRow::uses-hand-rolled-control::app/components/recipe/SpoonDialog#SpoonDialog::",
                    count: 1,
                    at: ["app/components/cookbook/KitchenHome.tsx:4"],
                },
            ],
            moves: [],
        });
    });
    it("swapping the component used at the same call site is neutral (Link to NiceLink in place)", () => {
        const page = (tag) => ({
            ...usedComponents,
            "app/routes/page.tsx": `import { Link } from "~/components/navigation/app-link";\nimport { NiceLink } from "~/components/nice";\nexport function Page() { return <${tag} href="/x" />; }`,
        });
        expect(rise(page("Link"), page("NiceLink"))).toEqual({
            regressions: [],
            moves: [
                {
                    from: "app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/navigation/app-link#Link::",
                    to: "app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/nice#NiceLink::",
                },
            ],
        });
    });
    it("counts every hop of a wrapper chain, and terminates on a cycle", () => {
        const files = {
            "app/components/raw.tsx": `export function Raw() { return <button />; }`,
            "app/components/nice.tsx": `import { Raw } from "./raw";\nexport function Nice() { return <Raw />; }`,
            "app/components/r1.tsx": `import { Nice } from "./nice";\nexport function R1() { return <Nice />; }`,
            "app/routes/page.tsx": `import { R1 } from "~/components/r1";\nexport function Page() { return <R1 />; }`,
            "app/components/a.tsx": `import { B } from "./b";\nexport function A() { return <B />; }`,
            "app/components/b.tsx": `import { A } from "./a";\nexport function B() { return <><A /><button /></>; }`,
            "app/components/c.tsx": `import { D } from "./d";\nexport function C() { return <D />; }`,
            "app/components/d.tsx": `import { C } from "./c";\nexport function D() { return <C />; }`,
        };
        expect(scanFiles(files).map((offender) => offender.fingerprint)).toEqual([
            "app/components/a.tsx::A::uses-hand-rolled-control::app/components/b#B::",
            "app/components/b.tsx::B::raw-button::button::",
            "app/components/b.tsx::B::uses-hand-rolled-control::app/components/a#A::",
            "app/components/nice.tsx::Nice::uses-hand-rolled-control::app/components/raw#Raw::",
            "app/components/r1.tsx::R1::uses-hand-rolled-control::app/components/nice#Nice::",
            "app/components/raw.tsx::Raw::raw-button::button::",
            "app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/r1#R1::",
        ]);
    });
    const panelAt = (file, name) => ({
        [file]: `export function ${name}() { return <button type="button" />; }`,
        "app/routes/page.tsx": `import { ${name} } from "~/${file.slice(4, -4)}";\nexport function Page() { return <${name} />; }`,
    });
    it("a moved file is neutral", () => {
        expect(rise(panelAt("app/components/old/panel.tsx", "Panel"), panelAt("app/components/new/panel.tsx", "Panel"))).toEqual({
            regressions: [],
            moves: [
                {
                    from: "app/components/old/panel.tsx::Panel::raw-button::button::type=button",
                    to: "app/components/new/panel.tsx::Panel::raw-button::button::type=button",
                },
                {
                    from: "app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/old/panel#Panel::",
                    to: "app/routes/page.tsx::Page::uses-hand-rolled-control::app/components/new/panel#Panel::",
                },
            ],
        });
    });
    it("a renamed component is neutral", () => {
        const result = rise(panelAt("app/components/panel.tsx", "Panel"), panelAt("app/components/panel.tsx", "Board"));
        expect(result.regressions).toEqual([]);
        expect(result.moves).toHaveLength(2);
    });
    it("a moved and renamed component needs a reason", () => {
        const result = rise(panelAt("app/components/old/panel.tsx", "Panel"), panelAt("app/components/new/board.tsx", "Board"));
        expect(result.regressions.map((regression) => regression.fingerprint)).toEqual([
            "app/components/new/board.tsx::Board::raw-button::button::type=button",
        ]);
    });
});
describe("isControlStateClass", () => {
    each([
        "focus:ring-2",
        "focus-within:ring-2",
        "focus-visible:outline",
        "active:opacity-70",
        "checked:bg-black",
        "indeterminate:bg-black",
        "open:rotate-90",
        "aria-checked:bg-black",
        "aria-selected:bg-black",
        "aria-current:font-bold",
        "aria-[expanded=true]:rotate-180",
        "data-checked:line-through",
        "data-[highlighted]:bg-black",
        "data-[current=true]:underline",
        "data-[starting-style]:opacity-0",
        "data-[swipe-direction=left]:translate-x-2",
        "group-focus-visible:ring",
        "peer-checked:block",
        "not-focus:opacity-50",
        "in-data-[state=open]:block",
        "[&:active]:scale-95",
        "[&[aria-pressed=true]]:bg-black",
        "has-[[open]]:shadow",
    ])("treats %s as control state", (token) => {
        expect(isControlStateClass(token)).toBe(true);
    });
    each([
        "hover:bg-black",
        "group-hover:scale-105",
        "motion-safe:animate-spin",
        "dark:bg-black",
        "md:grid",
        "pointer-fine:hover:underline",
        "data-[theme=dark]:bg-black",
        "data-app-action:bg-black",
        "aria-[sort=ascending]:font-bold",
        "aria-hidden:hidden",
        "[&>img]:rounded",
        "focus:",
        "focus-visible",
        "",
    ])("leaves %s alone", (token) => {
        expect(isControlStateClass(token)).toBe(false);
    });
});
describe("findOffendersInSource: stylesheets", () => {
    const APP_HOOKS = /\.app-|\[data-app-/;
    const css = (source) => findOffendersInSource("app/styles/tailwind.css", source, { hook: APP_HOOKS });
    it("finds focus, press and selection rules on .app-* classes and [data-app-*] hooks", () => {
        const source = `
      .app-skip-link:focus,
      .app-skip-link:focus-visible { outline: 2px solid; }
      .app-desktop-nav-link[data-current="true"] { color: red; }
      [data-app-action="primary"]:active:not([data-disabled]) { scale: 0.97; }
      @media (hover: hover) {
        .app-row[aria-expanded="true"] .app-chevron { rotate: 90deg; }
      }`;
        expect(css(source)).toEqual([
            {
                category: "control-state-style",
                fingerprint: "app/styles/tailwind.css::(stylesheet)::control-state-style::.app-skip-link:focus::",
                file: "app/styles/tailwind.css",
                line: 2,
            },
            {
                category: "control-state-style",
                fingerprint: "app/styles/tailwind.css::(stylesheet)::control-state-style::.app-skip-link:focus-visible::",
                file: "app/styles/tailwind.css",
                line: 2,
            },
            {
                category: "control-state-style",
                fingerprint: 'app/styles/tailwind.css::(stylesheet)::control-state-style::.app-desktop-nav-link[data-current="true"]::',
                file: "app/styles/tailwind.css",
                line: 4,
            },
            {
                category: "control-state-style",
                fingerprint: 'app/styles/tailwind.css::(stylesheet)::control-state-style::[data-app-action="primary"]:active:not([data-disabled])::',
                file: "app/styles/tailwind.css",
                line: 5,
            },
            {
                category: "control-state-style",
                fingerprint: 'app/styles/tailwind.css::(stylesheet)::control-state-style::.app-row[aria-expanded="true"] .app-chevron::@media (hover: hover)',
                file: "app/styles/tailwind.css",
                line: 7,
            },
        ]);
    });
    it("composes nested rules with their parents and reads @apply utilities", () => {
        const source = `
      .app-tab {
        color: red;
        &:focus-visible { outline: 2px solid; }
        &:hover { color: blue; }
      }
      .app-chip { @apply rounded focus-visible:ring-2; }
      .app-plain { @apply rounded hover:underline; }
      @layer components { .app-toggle { @apply data-[state=on]:bg-black; } }
      @apply focus:ring-2;
      .other { @apply focus:ring-2; }`;
        expect(css(source).map((offender) => offender.fingerprint)).toEqual([
            "app/styles/tailwind.css::(stylesheet)::control-state-style::.app-tab &:focus-visible::",
            "app/styles/tailwind.css::(stylesheet)::control-state-style::.app-chip::@apply",
            "app/styles/tailwind.css::(stylesheet)::control-state-style::.app-toggle::@layer components @apply",
        ]);
    });
    it("finds control state on any class or data-* hook when the app names no hook prefix", () => {
        const source = `
      .other:focus { color: red; }
      [data-open] .panel { display: block; }
      .card:hover { color: blue; }
      button:focus-visible { outline: none; }`;
        expect(findOffendersInSource("app/styles/app.css", source).map((offender) => offender.fingerprint)).toEqual([
            "app/styles/app.css::(stylesheet)::control-state-style::.other:focus::",
            "app/styles/app.css::(stylesheet)::control-state-style::[data-open] .panel::",
        ]);
    });
    it("leaves hover-only photo motion, unhooked state and keyframes alone", () => {
        const source = `
      .app-photo-tile img { transition: transform 300ms var(--ouro-ease-out); }
      .app-photo-tile:hover img { transform: scale(1.04); }
      .font-app-ui:focus { color: red; }
      :where(html[data-theme-switching] :is(input, button)) { transition: none; }
      button:focus-visible { outline: none; }
      @keyframes app-checklist-strike-draw { from { scale: 0 1; } to { scale: 1 1; } }`;
        expect(css(source)).toEqual([]);
    });
});
describe("findOffendersInSource: exemptions", () => {
    it("exempts a hidden input, however the type is quoted", () => {
        const source = `function Hidden() {
      return <form>
        <input type="hidden" name="intent" value="save" />
        <input type={"hidden"} name="id" className="focus:ring" />
      </form>;
    }`;
        expect(scan(source)).toEqual([]);
    });
    it("exempts Ouro component calls", () => {
        const source = `
      import { Button } from "~/components/ouro/button/button";
      import { Link } from "~/components/ouro/link/link";
      import { Checkbox } from "~/components/ouro/checkbox/checkbox";
      export function Actions({ save }) {
        return <>
          <Button type="button" onClick={save}>Save</Button>
          <Link href="/recipes">Recipes</Link>
          <Checkbox name="done" />
        </>;
      }`;
        expect(scan(source)).toEqual([]);
    });
    it("exempts the anchor Ouro's Link renders through OuroProvider's linkComponent", () => {
        const source = `
      import type { ComponentProps } from "react";
      import { Link } from "react-router";
      import type { OuroLinkComponent } from "~/lib/ouro/use-ouro";
      export function OuroRouterLink({ href, ...props }: ComponentProps<OuroLinkComponent>) {
        return <Link to={href} {...props} />;
      }
      export const PlainLink: OuroLinkComponent = (props) => <a {...props} />;
      export const WrappedLink: OuroLinkComponent = forwardRef(function Anchor(props, ref) {
        return <a ref={ref} {...props} />;
      });
      export function NotAnAdapter({ href }: { href: string }) {
        return <a href={href} />;
      }`;
        expect(fingerprints(source)).toEqual(["app/routes/fixture.tsx::NotAnAdapter::raw-anchor::a::"]);
    });
    it("exempts a hover-only photo transform", () => {
        expect(scan(`function Photo() { return <img className="transition-transform group-hover:scale-105" alt="" />; }`)).toEqual([]);
    });
});
describe("fingerprints", () => {
    it("name the enclosing component, through wrappers and anonymous callbacks", () => {
        const source = `
      export default function RecipePage({ items }) {
        return <ul>{items.map((item) => <li key={item.id}><button type="button">x</button></li>)}</ul>;
      }
      export const Row = forwardRef(function RowInner(props, ref) { return <button type="submit" />; });
      export const Cell = memo((props) => <button name="cell" />);
      const Arrow = () => <button name="arrow" />;
      const Wrapped = (memo((() => <button name="wrapped" />)) as Component);
      class Legacy { render() { return <button name="legacy" />; } }
      const actions = { Open: () => <button name="open" /> };
      function renderHelper() { return <button name="helper" />; }
      function outer() { function inner() { return <button name="inner" />; } }
      export default () => <button name="default" />;
      const top = <button name="top" />;
    `;
        expect(fingerprints(source)).toEqual([
            "app/routes/fixture.tsx::RecipePage::raw-button::button::type=button",
            "app/routes/fixture.tsx::RowInner::raw-button::button::type=submit",
            "app/routes/fixture.tsx::Cell::raw-button::button::name=cell",
            "app/routes/fixture.tsx::Arrow::raw-button::button::name=arrow",
            "app/routes/fixture.tsx::Wrapped::raw-button::button::name=wrapped",
            "app/routes/fixture.tsx::Legacy::raw-button::button::name=legacy",
            "app/routes/fixture.tsx::Open::raw-button::button::name=open",
            "app/routes/fixture.tsx::renderHelper::raw-button::button::name=helper",
            "app/routes/fixture.tsx::inner::raw-button::button::name=inner",
            "app/routes/fixture.tsx::(module)::raw-button::button::name=default",
            "app/routes/fixture.tsx::(module)::raw-button::button::name=top",
        ]);
    });
    it("record only the stable props, in a fixed order, literal or as written", () => {
        const source = `function Props({ label }) {
      return <>
        <button role="switch" aria-label={label} name={"go"} type="button" disabled id="x" />
        <button aria-label={\`Remove \${label}\`} />
        <button type={  label  ?  "submit"  :  "button"  } />
        <button aria-label />
        <button aria-label={1} />
        <button aria-label={} />
      </>;
    }`;
        expect(scan(source).filter((offender) => offender.category === "raw-button").map((o) => o.fingerprint)).toEqual([
            "app/routes/fixture.tsx::Props::raw-button::button::type=button,name=go,aria-label={label},role=switch",
            "app/routes/fixture.tsx::Props::raw-button::button::aria-label={`Remove ${label}`}",
            'app/routes/fixture.tsx::Props::raw-button::button::type={ label ? "submit" : "button" }',
            "app/routes/fixture.tsx::Props::raw-button::button::aria-label=true",
            "app/routes/fixture.tsx::Props::raw-button::button::aria-label=1",
            "app/routes/fixture.tsx::Props::raw-button::button::aria-label={}",
        ]);
    });
    it("do not change when lines move, and report the new line", () => {
        const before = `function Save() {\n  return <button type="button">Save</button>;\n}`;
        const after = `\n\n// a comment\n\nfunction Save() {\n\n  return (\n    <button type="button">Save</button>\n  );\n}`;
        expect(fingerprints(after)).toEqual(fingerprints(before));
        expect(scan(before)[0].line).toBe(2);
        expect(scan(after)[0].line).toBe(8);
    });
    it("change when the file is renamed", () => {
        const source = `function Save() { return <button type="button">Save</button>; }`;
        expect(fingerprints(source, "app/routes/a.tsx")).not.toEqual(fingerprints(source, "app/routes/b.tsx"));
    });
    it("parse plain .ts files without JSX", () => {
        expect(scan(`export function mark(el) { el.setAttribute("data-ouro", "x"); const n = <number>1; }`, "app/lib/x.ts")).toEqual([
            {
                category: "data-ouro-attr",
                fingerprint: "app/lib/x.ts::mark::data-ouro-attr::setAttribute::",
                file: "app/lib/x.ts",
                line: 1,
            },
        ]);
    });
});
const APP = { src: "app", ouroDirs: ["app/components/ouro/", "app/lib/ouro/"], exclude: ["app/lib/generated/"] };
describe("file selection", () => {
    each([
        ["app/routes/recipes.$id.tsx", true],
        ["app/lib/quantity.ts", true],
        ["app/root.tsx", true],
        ["app/styles/tailwind.css", true],
        ["app/styles/nested/other.css", true],
        ["app/components/ouro/button/button.tsx", false],
        ["app/lib/ouro/cn.ts", false],
        ["app/lib/generated/api-v1-playground.ts", false],
        ["app/__tests__/root.test.tsx", false],
        ["app/lib/quantity.test.ts", false],
        ["app/components/recipe/thing.spec.tsx", false],
        ["app/components/recipe/thing.stories.tsx", false],
        ["app/vite-env.d.ts", false],
        ["app/routes/readme.md", false],
        ["workers/app.ts", false],
    ])("isScannedFile(%s) is %s", (file, expected) => {
        expect(isScannedFile(file, APP)).toBe(expected);
    });
    it("lists scanned files under app/, sorted, with forward slashes", () => {
        const readdir = vi.fn(() => [
            "routes/b.tsx",
            ["routes", "a.tsx"].join(path.sep),
            "components/ouro/button/button.tsx",
            "styles/tailwind.css",
            "routes",
        ]);
        expect(listSourceFiles("/repo", APP, readdir)).toEqual(["app/routes/a.tsx", "app/routes/b.tsx", "app/styles/tailwind.css"]);
        expect(readdir).toHaveBeenCalledWith(path.join("/repo", "app"));
    });
    it("reads each file relative to the root, accepting absolute paths", () => {
        const readFile = vi.fn((file) => file.endsWith(".css") ? ".app-x:focus { color: red; }" : `function A() { return <button />; }`);
        const offenders = findOffenders(["/repo/app/routes/b.tsx", "app/styles/tailwind.css", "app/routes/a.tsx"], {
            root: "/repo",
            readFile,
        });
        expect(readFile).toHaveBeenCalledWith(path.join("/repo", "app/routes/b.tsx"));
        expect(offenders.map((offender) => offender.fingerprint)).toEqual([
            "app/routes/a.tsx::A::raw-button::button::",
            "app/routes/b.tsx::A::raw-button::button::",
            "app/styles/tailwind.css::(stylesheet)::control-state-style::.app-x:focus::",
        ]);
    });
    it("sorts offenders in one file by line, then fingerprint", () => {
        const readFile = () => `function A() { return <><button name="b" /><button name="a" /></>; }\nconst B = () => <a />;`;
        expect(findOffenders(["app/x.tsx"], { readFile }).map((o) => `${o.line} ${o.fingerprint}`)).toEqual([
            "1 app/x.tsx::A::raw-button::button::name=a",
            "1 app/x.tsx::A::raw-button::button::name=b",
            "2 app/x.tsx::B::raw-anchor::a::",
        ]);
    });
});
describe("the baseline", () => {
    const offender = (fingerprint, line = 1) => ({
        category: "raw-button",
        fingerprint,
        file: "app/x.tsx",
        line,
    });
    it("counts fingerprints, sorted", () => {
        expect(countFingerprints([offender("b"), offender("a"), offender("b", 9)])).toEqual({ a: 1, b: 2 });
        expect(Object.keys(countFingerprints([offender("b"), offender("a")]))).toEqual(["a", "b"]);
    });
    it("serializes sorted offenders with a trailing newline", () => {
        expect(serializeBaseline([offender("b"), offender("a"), offender("b")])).toBe(`${JSON.stringify({ offenders: { a: 1, b: 2 } }, null, 2)}\n`);
    });
    it("serializes allowed regressions, sorted, ahead of the offenders", () => {
        expect(serializeBaseline([offender("a")], [
            { fingerprint: "b", count: 2, reason: "second" },
            { fingerprint: "a", count: 1, reason: "first" },
        ])).toBe(`${JSON.stringify({
            allowedRegressions: [
                { fingerprint: "a", count: 1, reason: "first" },
                { fingerprint: "b", count: 2, reason: "second" },
            ],
            offenders: { a: 1 },
        }, null, 2)}\n`);
    });
    it("matches when the scan equals the baseline", () => {
        const comparison = compareWithBaseline([offender("a"), offender("a")], { a: 2 });
        expect(comparison).toEqual({ added: [], removed: [] });
        expect(formatComparison(comparison)).toEqual([]);
    });
    it("fails a new offender, and one more of a known fingerprint", () => {
        const comparison = compareWithBaseline([offender("a", 3), offender("a", 7), offender("new", 5)], { a: 1 });
        expect(comparison.added).toEqual([
            { fingerprint: "a", count: 1, at: ["app/x.tsx:3", "app/x.tsx:7"] },
            { fingerprint: "new", count: 1, at: ["app/x.tsx:5"] },
        ]);
        expect(formatComparison(comparison)).toEqual([
            "New hand-rolled control: a (+1) at app/x.tsx:3, app/x.tsx:7. Use an Ouro component instead (add the missing one to Ouro UI first).",
            "New hand-rolled control: new (+1) at app/x.tsx:5. Use an Ouro component instead (add the missing one to Ouro UI first).",
        ]);
    });
    it("fails a missing offender and says to remove it from the baseline", () => {
        const comparison = compareWithBaseline([offender("a")], { a: 3, gone: 1 });
        expect(comparison.removed).toEqual([
            { fingerprint: "a", count: 2 },
            { fingerprint: "gone", count: 1 },
        ]);
        expect(formatComparison(comparison)).toEqual([
            "Fixed: a (-2); remove it from the baseline: node scripts/ouro-source-rules.mjs --write-baseline",
            "Fixed: gone (-1); remove it from the baseline: node scripts/ouro-source-rules.mjs --write-baseline",
        ]);
    });
});
describe("loadConfig", () => {
    const missing = () => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    };
    const has = (...directories) => (directory) => {
        if (directories.some((name) => directory === path.join("/repo", name)))
            return [];
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    };
    it("scans src/ when the app has one, else app/, skipping the Ouro installs, with the default baseline", () => {
        const src = loadConfig("/repo", { readFile: missing, readdir: has("src", "app") });
        expect(src).toMatchObject({ src: "src", ouroDirs: ["src/components/ouro/", "src/lib/ouro/"], exclude: [], baseline: BASELINE_PATH });
        expect(src.hook.test(".card:focus")).toBe(true);
        expect(src.hook.test("[data-open]")).toBe(true);
        expect(src.hook.test("button:focus")).toBe(false);
        expect(loadConfig("/repo", { readFile: missing, readdir: has("app") }).src).toBe("app");
        expect(loadConfig("/repo", { readFile: missing, readdir: has() }).src).toBe("app");
    });
    it("reads its settings from ouro-source-rules.json", () => {
        const readFile = vi.fn(() => JSON.stringify({ src: "web/", ouroDirs: ["web/ui/ouro", "web/lib/ouro/"], exclude: ["web/generated/"], hookPrefix: "nf", baseline: "test/rules.json" }));
        const config = loadConfig("/repo", { readFile, readdir: has() });
        expect(readFile).toHaveBeenCalledWith(path.join("/repo", CONFIG_PATH));
        expect(config).toMatchObject({ src: "web", ouroDirs: ["web/ui/ouro/", "web/lib/ouro/"], exclude: ["web/generated/"], baseline: "test/rules.json" });
        expect(config.hook.test(".nf-row:focus")).toBe(true);
        expect(config.hook.test("[data-nf-open]")).toBe(true);
        expect(config.hook.test(".row:focus")).toBe(false);
        expect(isScannedFile("web/routes/a.tsx", config)).toBe(true);
        expect(isScannedFile("web/ui/ouro/button/button.tsx", config)).toBe(false);
        expect(isScannedFile("web/generated/api.ts", config)).toBe(false);
    });
    it("names the settings file when it cannot be read or parsed", () => {
        expect(() => loadConfig("/repo", { readFile: () => "{", readdir: has() })).toThrow(`${CONFIG_PATH}: `);
        expect(() => loadConfig("/repo", {
            readFile: () => {
                throw "EACCES";
            },
            readdir: has(),
        })).toThrow(`${CONFIG_PATH}: EACCES`);
    });
});
describe("main", () => {
    const files = {
        "/repo/app/routes/a.tsx": `export function A() { return <button type="button" />; }`,
    };
    const baselineFile = path.join("/repo", BASELINE_PATH);
    const setup = (baseline, extra = {}) => {
        const store = { ...files, ...extra };
        if (baseline !== undefined)
            store[baselineFile] = baseline;
        const readFile = vi.fn((file) => {
            if (!(file in store))
                throw Object.assign(new Error(`ENOENT: ${file}`), { code: "ENOENT" });
            return store[file];
        });
        const readdir = vi.fn((directory) => {
            const inside = Object.keys(store).filter((f) => f.startsWith(`${directory}/`));
            if (inside.length === 0)
                throw Object.assign(new Error(`ENOENT: ${directory}`), { code: "ENOENT" });
            return inside.map((f) => f.slice(directory.length + 1));
        });
        const writeFile = vi.fn();
        const io = { log: vi.fn(), error: vi.fn() };
        const exit = vi.fn();
        const gitShow = vi.fn(() => undefined);
        return { deps: { root: "/repo", readFile, readdir, writeFile, io, exit, gitShow }, writeFile, io, exit, gitShow };
    };
    const baselineOf = (offenders, allowedRegressions) => `${JSON.stringify(allowedRegressions ? { allowedRegressions, offenders } : { offenders }, null, 2)}\n`;
    // The files at the base ref, by path from the root (a folder's path ends in "/").
    const atBase = (tree) => (_root, _ref, file) => tree[file];
    const A = "app/routes/a.tsx::A::raw-button::button::type=button";
    const B = "app/routes/b.tsx::B::raw-anchor::a::";
    const matching = `${JSON.stringify({ offenders: { "app/routes/a.tsx::A::raw-button::button::type=button": 1 } }, null, 2)}\n`;
    it("passes when the scan equals the baseline", () => {
        const { deps, io, exit, writeFile } = setup(matching);
        main([], deps);
        expect(io.log).toHaveBeenCalledWith("ouro-source-rules: 1 file(s), 1 offender(s), all in the baseline.");
        expect(io.error).not.toHaveBeenCalled();
        expect(exit).not.toHaveBeenCalled();
        expect(writeFile).not.toHaveBeenCalled();
    });
    it("fails a new offender", () => {
        const { deps, io, exit } = setup(matching, { "/repo/app/routes/b.tsx": `const B = () => <a href="/" />;` });
        main([], deps);
        expect(io.error).toHaveBeenCalledWith(expect.stringContaining("New hand-rolled control: app/routes/b.tsx::B::raw-anchor::a::"));
        expect(exit).toHaveBeenCalledWith(1);
    });
    it("fails a fixed offender until it is removed from the baseline", () => {
        const { deps, io, exit } = setup(matching, { "/repo/app/routes/a.tsx": `export const A = 1;` });
        main([], deps);
        expect(io.error).toHaveBeenCalledWith(expect.stringContaining("remove it from the baseline"));
        expect(exit).toHaveBeenCalledWith(1);
    });
    it("treats a missing baseline as empty", () => {
        const { deps, io, exit } = setup();
        main([], deps);
        expect(io.error).toHaveBeenCalledWith(expect.stringContaining("New hand-rolled control"));
        expect(exit).toHaveBeenCalledWith(1);
    });
    it("rethrows a baseline read failure other than a missing file", () => {
        const { deps } = setup(matching);
        const readFile = vi.fn((file) => {
            if (file === baselineFile)
                throw new Error("EACCES");
            if (!(file in files))
                throw Object.assign(new Error(`ENOENT: ${file}`), { code: "ENOENT" });
            return files[file];
        });
        expect(() => main([], { ...deps, readFile })).toThrow("EACCES");
    });
    it("writes a smaller baseline", () => {
        const { deps, io, exit, writeFile } = setup(matching, { "/repo/app/routes/a.tsx": `export const A = 1;` });
        main(["--write-baseline"], deps);
        expect(writeFile).toHaveBeenCalledWith(baselineFile, `${JSON.stringify({ offenders: {} }, null, 2)}\n`);
        expect(io.log).toHaveBeenCalledWith(`ouro-source-rules: wrote ${BASELINE_PATH} with 0 offender(s), 0 move(s) and 0 allowed regression(s).`);
        expect(exit).not.toHaveBeenCalled();
    });
    it("refuses to write a baseline that adds an offender", () => {
        const { deps, io, exit, writeFile } = setup(matching, { "/repo/app/routes/b.tsx": `const B = () => <a href="/" />;` });
        main(["--write-baseline"], deps);
        expect(writeFile).not.toHaveBeenCalled();
        expect(io.error).toHaveBeenCalledWith(expect.stringContaining("New hand-rolled control"));
        expect(io.error).toHaveBeenCalledWith("ouro-source-rules: the baseline only shrinks. Replace the new controls with Ouro components, or pass --allow-regression <reason> for review.");
        expect(exit).toHaveBeenCalledWith(1);
    });
    it("writes the first baseline, where the app starts, without a reason", () => {
        const { deps, io, exit, writeFile } = setup(undefined);
        main(["--write-baseline"], deps);
        expect(writeFile).toHaveBeenCalledWith(baselineFile, baselineOf({ [A]: 1 }));
        expect(io.log).toHaveBeenCalledWith(`ouro-source-rules: wrote ${BASELINE_PATH} with 1 offender(s), 0 move(s) and 0 allowed regression(s); it is the first baseline, so it records where the app starts.`);
        expect(exit).not.toHaveBeenCalled();
    });
    it("writes a larger baseline only with a stated reason", () => {
        const { deps, io, exit, writeFile } = setup(baselineOf({}));
        main(["--write-baseline", "--allow-regression", "first baseline"], deps);
        expect(writeFile).toHaveBeenCalledWith(baselineFile, baselineOf({ [A]: 1 }, [{ fingerprint: A, count: 1, reason: "first baseline" }]));
        expect(io.log).toHaveBeenCalledWith(`ouro-source-rules: wrote ${BASELINE_PATH} with 1 offender(s), 0 move(s) and 1 allowed regression(s).`);
        expect(exit).not.toHaveBeenCalled();
    });
    it("writes a moved file without a reason, and drops allowed regressions an earlier pull request recorded", () => {
        const moved = { "/repo/app/routes/a.tsx": `export const A = 1;`, "/repo/app/routes/c.tsx": `export function A() { return <button type="button" />; }` };
        const { deps, io, writeFile } = setup(baselineOf({ [A]: 1 }, [{ fingerprint: A, count: 1, reason: "older pull request" }]), moved);
        main(["--write-baseline"], deps);
        expect(writeFile).toHaveBeenCalledWith(baselineFile, baselineOf({ "app/routes/c.tsx::A::raw-button::button::type=button": 1 }));
        expect(io.log).toHaveBeenCalledWith(`ouro-source-rules: wrote ${BASELINE_PATH} with 1 offender(s), 1 move(s) and 0 allowed regression(s).`);
    });
    it("writes against a base ref, keeping this pull request's earlier reasons", () => {
        const extra = { "/repo/app/routes/b.tsx": `const B = () => <a href="/" />;` };
        const { deps, writeFile, gitShow, exit } = setup(baselineOf({ [A]: 1, [B]: 1 }, [{ fingerprint: B, count: 1, reason: "earlier in this PR" }]), extra);
        gitShow.mockImplementation(atBase({ [BASELINE_PATH]: baselineOf({ [A]: 1 }) }));
        main(["--write-baseline", "--base", "origin/main"], deps);
        expect(gitShow).toHaveBeenCalledWith("/repo", "origin/main", BASELINE_PATH);
        expect(writeFile).toHaveBeenCalledWith(baselineFile, baselineOf({ [A]: 1, [B]: 1 }, [{ fingerprint: B, count: 1, reason: "earlier in this PR" }]));
        expect(exit).not.toHaveBeenCalled();
    });
    it("does not reuse an earlier reason for a larger rise, or one already on the base", () => {
        const extra = {
            "/repo/app/routes/b.tsx": `const B = () => <><a href="/" /><a href="/" /></>;`,
        };
        const larger = setup(baselineOf({ [A]: 1, [B]: 2 }, [{ fingerprint: B, count: 1, reason: "earlier in this PR" }]), extra);
        larger.gitShow.mockImplementation(atBase({ [BASELINE_PATH]: baselineOf({ [A]: 1 }) }));
        main(["--write-baseline", "--base", "origin/main"], larger.deps);
        expect(larger.writeFile).not.toHaveBeenCalled();
        expect(larger.exit).toHaveBeenCalledWith(1);
        const entry = { fingerprint: B, count: 2, reason: "spent on main" };
        const spent = setup(baselineOf({ [A]: 1, [B]: 2 }, [entry]), extra);
        spent.gitShow.mockImplementation(atBase({ [BASELINE_PATH]: baselineOf({ [A]: 1 }, [entry]) }));
        main(["--write-baseline", "--base", "origin/main"], spent.deps);
        expect(spent.writeFile).not.toHaveBeenCalled();
        expect(spent.exit).toHaveBeenCalledWith(1);
        const renewed = setup(baselineOf({ [A]: 1, [B]: 2 }, [entry]), extra);
        renewed.gitShow.mockImplementation(atBase({ [BASELINE_PATH]: baselineOf({ [A]: 1 }, [entry]) }));
        main(["--write-baseline", "--base", "origin/main", "--allow-regression", "a new reason"], renewed.deps);
        expect(renewed.writeFile).toHaveBeenCalledWith(baselineFile, baselineOf({ [A]: 1, [B]: 2 }, [{ fingerprint: B, count: 2, reason: "a new reason" }]));
    });
    it("records no allowed regressions when the base ref has no baseline, but still wants a reason to rise", () => {
        const extra = { "/repo/app/routes/b.tsx": `const B = () => <a href="/" />;` };
        const refused = setup(baselineOf({ [A]: 1 }, [{ fingerprint: A, count: 1, reason: "old" }]), extra);
        main(["--write-baseline", "--base", "origin/main"], refused.deps);
        expect(refused.writeFile).not.toHaveBeenCalled();
        expect(refused.exit).toHaveBeenCalledWith(1);
        const { deps, writeFile, io } = setup(baselineOf({ [A]: 1 }, [{ fingerprint: A, count: 1, reason: "old" }]), extra);
        main(["--write-baseline", "--base", "origin/main", "--allow-regression", "measure"], deps);
        expect(writeFile).toHaveBeenCalledWith(baselineFile, baselineOf({ [A]: 1, [B]: 1 }));
        expect(io.log).toHaveBeenCalledWith(`ouro-source-rules: wrote ${BASELINE_PATH} with 2 offender(s), 0 move(s) and 0 allowed regression(s); origin/main has no baseline, so nothing is recorded to ratchet against.`);
    });
    it("refuses to write a rise against the base ref without a reason", () => {
        const extra = { "/repo/app/routes/b.tsx": `const B = () => <a href="/" />;` };
        const { deps, writeFile, gitShow, exit } = setup(baselineOf({ [A]: 1, [B]: 1 }), extra);
        gitShow.mockImplementation(atBase({ [BASELINE_PATH]: baselineOf({ [A]: 1 }) }));
        main(["--write-baseline", "--base", "origin/main"], deps);
        expect(writeFile).not.toHaveBeenCalled();
        expect(exit).toHaveBeenCalledWith(1);
    });
    describe("--base: the ratchet", () => {
        const extra = { "/repo/app/routes/b.tsx": `const B = () => <a href="/" />;` };
        it("passes with no rise against the base, counting moves", () => {
            const { deps, io, exit, gitShow } = setup(matching);
            gitShow.mockImplementation(atBase({ [BASELINE_PATH]: baselineOf({ "app/routes/old.tsx::A::raw-button::button::type=button": 1 }) }));
            main(["--base", "abc123"], deps);
            expect(io.log).toHaveBeenCalledWith("ouro-source-rules: ratchet against abc123: 0 allowed regression(s), 1 move(s).");
            expect(exit).not.toHaveBeenCalled();
        });
        it("fails a rise the new baseline does not allow, with the command to record why", () => {
            const { deps, io, exit, gitShow } = setup(baselineOf({ [A]: 1, [B]: 1 }), extra);
            gitShow.mockImplementation(atBase({ [BASELINE_PATH]: matching }));
            main(["--base", "abc123"], deps);
            expect(io.error).toHaveBeenCalledWith(`Regression against abc123: ${B} (+1) at app/routes/b.tsx:1. Use an Ouro component instead, or record why: node scripts/ouro-source-rules.mjs --write-baseline --base abc123 --allow-regression "<reason>"`);
            expect(exit).toHaveBeenCalledWith(1);
        });
        it("gives a spinner's rise the Skeleton advice, not \"use an Ouro component\"", () => {
            const S = "app/routes/s.tsx::S::content-spinner::~/components/ouro/spinner/spinner.Spinner::";
            const spinner = { "/repo/app/routes/s.tsx": `import { Spinner } from "~/components/ouro/spinner/spinner";\nconst S = () => <Spinner label="Loading" />;` };
            const { deps, io, exit, gitShow } = setup(baselineOf({ [A]: 1, [S]: 1 }), spinner);
            gitShow.mockImplementation(atBase({ [BASELINE_PATH]: matching }));
            main(["--base", "abc123"], deps);
            const line = io.error.mock.calls.map((call) => String(call[0])).find((text) => text.startsWith("Regression against abc123: " + S));
            expect(line).toContain("Show a Skeleton shaped like the content instead");
            expect(line).not.toContain("Use an Ouro component instead");
            expect(exit).toHaveBeenCalledWith(1);
        });
        it("gives an index's rise the useMemo advice, not \"use an Ouro component\"", () => {
            const R = "app/routes/r.tsx::R::render-index::Map::byId";
            const rows = { "/repo/app/routes/r.tsx": `export function R({ rows }) {\n  const byId = new Map(rows);\n  return byId.size;\n}` };
            const { deps, io, exit, gitShow } = setup(baselineOf({ [A]: 1, [R]: 1 }), rows);
            gitShow.mockImplementation(atBase({ [BASELINE_PATH]: matching }));
            main(["--base", "abc123"], deps);
            const line = io.error.mock.calls.map((call) => String(call[0])).find((text) => text.startsWith("Regression against abc123: " + R));
            expect(line).toContain("or in useMemo on its inputs");
            expect(line).toContain("on every render, a keystroke or a hover included; or record why:");
            expect(line).not.toContain("Use an Ouro component instead");
            expect(exit).toHaveBeenCalledWith(1);
        });
        it("gives a layout animation's rise the transform and opacity advice, not \"use an Ouro component\"", () => {
            const L = "app/routes/l.tsx::L::layout-animation::transition-all::";
            const panel = { "/repo/app/routes/l.tsx": `export function L() {\n  return <div className="transition-all" />;\n}` };
            const { deps, io, exit, gitShow } = setup(baselineOf({ [A]: 1, [L]: 1 }), panel);
            gitShow.mockImplementation(atBase({ [BASELINE_PATH]: matching }));
            main(["--base", "abc123"], deps);
            const line = io.error.mock.calls.map((call) => String(call[0])).find((text) => text.startsWith("Regression against abc123: " + L));
            expect(line).toContain("Animate transform and opacity instead");
            expect(line).toContain("a size that must change changes at once; or record why:");
            expect(line).not.toContain("Use an Ouro component instead");
            expect(exit).toHaveBeenCalledWith(1);
        });
        it("gives failure copy's rise what to say instead, naming the phrase", () => {
            const V = "app/routes/v.tsx::V::vague-failure-copy::something went wrong::Something went wrong";
            const copy = { "/repo/app/routes/v.tsx": `export function V() {\n  return <p>Something went wrong</p>;\n}` };
            const { deps, io, exit, gitShow } = setup(baselineOf({ [A]: 1, [V]: 1 }), copy);
            gitShow.mockImplementation(atBase({ [BASELINE_PATH]: matching }));
            main(["--base", "abc123"], deps);
            expect(io.error).toHaveBeenCalledWith(`Regression against abc123: ${V} (+1) at app/routes/v.tsx:2. "something went wrong" doesn't say what failed or why. ${VAGUE_FAILURE_COPY_FIX.replace(/\.$/, ";")} or record why: node scripts/ouro-source-rules.mjs --write-baseline --base abc123 --allow-regression "<reason>"`);
            expect(exit).toHaveBeenCalledWith(1);
        });
        it("passes a rise the new baseline allows with a reason and count, and not an empty reason or a smaller count", () => {
            const allowed = setup(baselineOf({ [A]: 1, [B]: 1 }, [{ fingerprint: B, count: 1, reason: "measured" }]), extra);
            allowed.gitShow.mockImplementation(atBase({ [BASELINE_PATH]: matching }));
            main(["--base", "abc123"], allowed.deps);
            expect(allowed.exit).not.toHaveBeenCalled();
            expect(allowed.io.log).toHaveBeenCalledWith("ouro-source-rules: ratchet against abc123: 1 allowed regression(s), 0 move(s).");
            for (const entry of [{ fingerprint: B, count: 1, reason: " " }, { fingerprint: B, count: 1 }]) {
                const empty = setup(baselineOf({ [A]: 1, [B]: 1 }, [entry]), extra);
                empty.gitShow.mockImplementation(atBase({ [BASELINE_PATH]: matching }));
                main(["--base", "abc123"], empty.deps);
                expect(empty.exit).toHaveBeenCalledWith(1);
            }
            for (const entry of [{ fingerprint: B, count: 0, reason: "too small" }, { fingerprint: B, reason: "no count" }]) {
                const small = setup(baselineOf({ [A]: 1, [B]: 1 }, [entry]), extra);
                small.gitShow.mockImplementation(atBase({ [BASELINE_PATH]: matching }));
                main(["--base", "abc123"], small.deps);
                expect(small.io.error).toHaveBeenCalledWith(`Regression against abc123: ${B} (+1) at app/routes/b.tsx:1, but its allowed regression permits ${entry.count ?? 0}. Use an Ouro component instead, or record why: node scripts/ouro-source-rules.mjs --write-baseline --base abc123 --allow-regression "<reason>"`);
                expect(small.exit).toHaveBeenCalledWith(1);
            }
        });
        it("ignores an allowed regression already on the base: it allows nothing, and only a note says so", () => {
            const entry = { fingerprint: B, count: 1, reason: "spent" };
            const stale = "ouro-source-rules: 1 stale allowed regression(s) from an earlier pull request are ignored; the next --write-baseline drops them.";
            const { deps, io, exit, gitShow } = setup(baselineOf({ [A]: 1, [B]: 1 }, [entry]), extra);
            gitShow.mockImplementation(atBase({ [BASELINE_PATH]: baselineOf({ [A]: 1 }, [entry]) }));
            main(["--base", "abc123"], deps);
            expect(io.error).toHaveBeenCalledTimes(1);
            expect(io.error).toHaveBeenCalledWith(expect.stringContaining(`Regression against abc123: ${B} (+1)`));
            expect(exit).toHaveBeenCalledWith(1);
            const sameBaseline = setup(baselineOf({ [A]: 1, [B]: 1 }, [entry]), extra);
            sameBaseline.gitShow.mockImplementation(atBase({ [BASELINE_PATH]: baselineOf({ [A]: 1, [B]: 1 }, [entry]) }));
            main(["--base", "abc123"], sameBaseline.deps);
            expect(sameBaseline.io.error).not.toHaveBeenCalled();
            expect(sameBaseline.io.log).toHaveBeenCalledWith(stale);
            expect(sameBaseline.exit).not.toHaveBeenCalled();
            const other = setup(baselineOf({ [A]: 1, [B]: 1 }, [{ ...entry, reason: "this pull request" }]), extra);
            other.gitShow.mockImplementation(atBase({ [BASELINE_PATH]: baselineOf({ [A]: 1 }, [entry]) }));
            main(["--base", "abc123"], other.deps);
            expect(other.exit).not.toHaveBeenCalled();
            expect(other.io.log).not.toHaveBeenCalledWith(stale);
        });
        it("skips the ratchet when the base has no baseline yet", () => {
            const { deps, io, exit } = setup(matching);
            main(["--base", "abc123"], deps);
            expect(io.log).toHaveBeenCalledWith("ouro-source-rules: abc123 has no baseline; nothing to ratchet against.");
            expect(exit).not.toHaveBeenCalled();
        });
        it("still requires the scan to equal the committed baseline", () => {
            const { deps, io, exit, gitShow } = setup(matching, extra);
            gitShow.mockImplementation(atBase({ [BASELINE_PATH]: baselineOf({ [A]: 1, [B]: 1 }) }));
            main(["--base", "abc123"], deps);
            expect(io.error).toHaveBeenCalledWith(expect.stringContaining("New hand-rolled control"));
            expect(exit).toHaveBeenCalledWith(1);
        });
    });
    describe("--base: the settings at the base ref", () => {
        const settingsFile = path.join("/repo", CONFIG_PATH);
        const settings = (value) => ({ [settingsFile]: JSON.stringify(value) });
        const extra = { "/repo/app/routes/b.tsx": `const B = () => <a href="/" />;` };
        const change = (text) => `Settings change against abc123: ${CONFIG_PATH} ${text}. Revert it, or record why: node scripts/ouro-source-rules.mjs --write-baseline --base abc123 --allow-regression "<reason>"`;
        const refusal = "ouro-source-rules: the settings may only widen the scan against the base. Revert the change, or pass --allow-regression <reason> for review.";
        it("reads the settings and the baseline at the base's own paths, and fails a moved baseline", () => {
            const moved = path.join("/repo", "test/rules.json");
            const { deps, io, exit, gitShow } = setup(undefined, { ...extra, ...settings({ baseline: "test/rules.json" }), [moved]: baselineOf({ [A]: 1, [B]: 1 }) });
            gitShow.mockImplementation(atBase({ [BASELINE_PATH]: matching }));
            main(["--base", "abc123"], deps);
            expect(gitShow).toHaveBeenCalledWith("/repo", "abc123", CONFIG_PATH);
            expect(gitShow).toHaveBeenCalledWith("/repo", "abc123", "src/");
            expect(gitShow).toHaveBeenCalledWith("/repo", "abc123", BASELINE_PATH);
            expect(gitShow).not.toHaveBeenCalledWith("/repo", "abc123", "test/rules.json");
            expect(io.error).toHaveBeenCalledWith(change(`moves the baseline from ${BASELINE_PATH} to test/rules.json`));
            expect(io.error).toHaveBeenCalledWith(expect.stringContaining(`Regression against abc123: ${B} (+1)`));
            expect(io.log).not.toHaveBeenCalledWith(expect.stringContaining("nothing to ratchet against"));
            expect(exit).toHaveBeenCalledWith(1);
        });
        it("fails each setting that narrows the scan: src, an added exclude or ouroDirs entry, a set or changed hookPrefix", () => {
            const cases = [
                [undefined, { src: "app/routes" }, {}, ["reads app/routes/ instead of app/", "stops reading app/routes/components/ouro/ (ouroDirs)", "stops reading app/routes/lib/ouro/ (ouroDirs)"]],
                [undefined, {}, { "/repo/src/main.tsx": "export const M = 1;" }, ["reads src/ instead of app/", "stops reading src/components/ouro/ (ouroDirs)", "stops reading src/lib/ouro/ (ouroDirs)"]],
                [undefined, {}, {}, ["reads app/ instead of src/", "stops reading app/components/ouro/ (ouroDirs)", "stops reading app/lib/ouro/ (ouroDirs)"], { "src/": "tree src/" }],
                [{ exclude: ["app/generated/"] }, { exclude: ["app/generated/", "app/routes/"] }, {}, ["stops reading app/routes/ (exclude)"]],
                [undefined, { ouroDirs: ["app/components/ouro", "app/lib/ouro/", "app/routes/"] }, {}, ["stops reading app/routes/ (ouroDirs)"]],
                [undefined, { hookPrefix: "app" }, {}, [`sets hookPrefix to "app", so stylesheets count control state only on .app- and [data-app- hooks`]],
                [{ hookPrefix: "app" }, { hookPrefix: "nf" }, {}, [`sets hookPrefix to "nf", so stylesheets count control state only on .nf- and [data-nf- hooks`]],
            ];
            for (const [before, after, files, changes, tree = {}] of cases) {
                const { deps, io, exit, gitShow } = setup(baselineOf({}), { ...settings(after), ...files });
                gitShow.mockImplementation(atBase({ ...tree, [BASELINE_PATH]: baselineOf({}), ...(before && { [CONFIG_PATH]: JSON.stringify(before) }) }));
                main(["--base", "abc123"], deps);
                for (const text of changes)
                    expect(io.error).toHaveBeenCalledWith(change(text));
                expect(io.error.mock.calls.filter(([line]) => line.startsWith("Settings change")).length).toBe(changes.length);
                expect(exit).toHaveBeenCalledWith(1);
            }
        });
        it("passes settings that widen the scan or keep it", () => {
            const before = { exclude: ["app/generated/"], ouroDirs: ["app/components/ouro/", "app/lib/ouro/", "app/ui/"], hookPrefix: "app" };
            for (const after of [{ exclude: ["app/generated/client/"], ouroDirs: ["app/components/ouro/", "app/lib/ouro/", "app/ui/kit/"] }, before, { ...before, hookPrefix: "" }]) {
                const { deps, io, exit, gitShow } = setup(matching, settings(after));
                gitShow.mockImplementation(atBase({ [BASELINE_PATH]: matching, [CONFIG_PATH]: JSON.stringify(before) }));
                main(["--base", "abc123"], deps);
                expect(io.error).not.toHaveBeenCalled();
                expect(exit).not.toHaveBeenCalled();
            }
        });
        it("records a narrowing with a reason for this pull request, and never honours one already on the base", () => {
            const fingerprint = `${CONFIG_PATH}::exclude::app/generated/`;
            const refused = setup(matching, settings({ exclude: ["app/generated/"] }));
            refused.gitShow.mockImplementation(atBase({ [BASELINE_PATH]: matching }));
            main(["--write-baseline", "--base", "abc123"], refused.deps);
            expect(refused.writeFile).not.toHaveBeenCalled();
            expect(refused.io.error).toHaveBeenCalledWith(`Settings change against abc123: ${CONFIG_PATH} stops reading app/generated/ (exclude).`);
            expect(refused.io.error).toHaveBeenCalledWith(refusal);
            expect(refused.io.error).not.toHaveBeenCalledWith(expect.stringContaining("the baseline only shrinks"));
            expect(refused.exit).toHaveBeenCalledWith(1);
            const written = setup(matching, settings({ exclude: ["app/generated/"] }));
            written.gitShow.mockImplementation(atBase({ [BASELINE_PATH]: matching }));
            main(["--write-baseline", "--base", "abc123", "--allow-regression", "generated client"], written.deps);
            const recorded = baselineOf({ [A]: 1 }, [{ fingerprint, count: 1, reason: "generated client" }]);
            expect(written.writeFile).toHaveBeenCalledWith(baselineFile, recorded);
            expect(written.io.log).toHaveBeenCalledWith(`ouro-source-rules: wrote ${BASELINE_PATH} with 1 offender(s), 0 move(s) and 1 allowed regression(s).`);
            const kept = setup(recorded, settings({ exclude: ["app/generated/"] }));
            kept.gitShow.mockImplementation(atBase({ [BASELINE_PATH]: matching }));
            main(["--write-baseline", "--base", "abc123"], kept.deps);
            expect(kept.writeFile).toHaveBeenCalledWith(baselineFile, recorded);
            const checked = setup(recorded, settings({ exclude: ["app/generated/"] }));
            checked.gitShow.mockImplementation(atBase({ [BASELINE_PATH]: matching }));
            main(["--base", "abc123"], checked.deps);
            expect(checked.io.error).not.toHaveBeenCalled();
            expect(checked.io.log).toHaveBeenCalledWith("ouro-source-rules: ratchet against abc123: 1 allowed regression(s), 0 move(s).");
            expect(checked.exit).not.toHaveBeenCalled();
            const spent = setup(recorded, settings({ exclude: ["app/generated/"] }));
            spent.gitShow.mockImplementation(atBase({ [BASELINE_PATH]: recorded }));
            main(["--base", "abc123"], spent.deps);
            expect(spent.io.error).toHaveBeenCalledWith(change("stops reading app/generated/ (exclude)"));
            expect(spent.exit).toHaveBeenCalledWith(1);
        });
        it("fails a new failureCopyAllow match like a new exclude, unless a match at the base is part of it, and records it with a reason", () => {
            const copy = { "/repo/app/routes/v.tsx": `export const V = () => <p>The card service says your card could not be charged.</p>;` };
            const allow = (...matches) => ({ failureCopyAllow: matches.map((match) => ({ match, reason: "names the service and its answer" })) });
            const fingerprint = `${CONFIG_PATH}::failureCopyAllow::could not be charged`;
            const narrowed = setup(matching, { ...copy, ...settings(allow("could not be charged")) });
            narrowed.gitShow.mockImplementation(atBase({ [BASELINE_PATH]: matching }));
            main(["--base", "abc123"], narrowed.deps);
            expect(narrowed.io.error).toHaveBeenCalledWith(change('lets failure copy holding "could not be charged" through (failureCopyAllow)'));
            expect(narrowed.exit).toHaveBeenCalledWith(1);
            const written = setup(matching, { ...copy, ...settings(allow("could not be charged")) });
            written.gitShow.mockImplementation(atBase({ [BASELINE_PATH]: matching }));
            main(["--write-baseline", "--base", "abc123", "--allow-regression", "the card service's own answer"], written.deps);
            expect(written.writeFile).toHaveBeenCalledWith(baselineFile, baselineOf({ [A]: 1 }, [{ fingerprint, count: 1, reason: "the card service's own answer" }]));
            const covered = setup(matching, { ...copy, ...settings(allow("could not be charged")) });
            covered.gitShow.mockImplementation(atBase({ [BASELINE_PATH]: matching, [CONFIG_PATH]: JSON.stringify(allow("could not")) }));
            main(["--base", "abc123"], covered.deps);
            expect(covered.io.error).not.toHaveBeenCalled();
            expect(covered.exit).not.toHaveBeenCalled();
        });
        it("does not let a deleted and moved baseline start over", () => {
            const moved = settings({ baseline: "test/rules.json" });
            const write = setup(undefined, { ...extra, ...moved });
            write.gitShow.mockImplementation(atBase({ [BASELINE_PATH]: matching }));
            main(["--write-baseline", "--base", "abc123"], write.deps);
            expect(write.writeFile).not.toHaveBeenCalled();
            expect(write.io.error).toHaveBeenCalledWith(expect.stringContaining(`New hand-rolled control: ${B} (+1)`));
            expect(write.io.error).toHaveBeenCalledWith(`Settings change against abc123: ${CONFIG_PATH} moves the baseline from ${BASELINE_PATH} to test/rules.json.`);
            expect(write.exit).toHaveBeenCalledWith(1);
            const check = setup(undefined, { ...extra, ...moved });
            check.gitShow.mockImplementation(atBase({ [BASELINE_PATH]: matching }));
            main(["--base", "abc123"], check.deps);
            expect(check.io.error).toHaveBeenCalledWith(change(`moves the baseline from ${BASELINE_PATH} to test/rules.json`));
            expect(check.exit).toHaveBeenCalledWith(1);
        });
        it("adopts the rule with any settings when the base has neither the settings nor a baseline", () => {
            const adopted = settings({ exclude: ["app/generated/"], hookPrefix: "app", baseline: "test/rules.json" });
            const rules = path.join("/repo", "test/rules.json");
            const write = setup(undefined, adopted);
            main(["--write-baseline", "--base", "abc123"], write.deps);
            expect(write.writeFile).toHaveBeenCalledWith(rules, baselineOf({ [A]: 1 }));
            expect(write.io.log).toHaveBeenCalledWith("ouro-source-rules: wrote test/rules.json with 1 offender(s), 0 move(s) and 0 allowed regression(s); it is the first baseline, so it records where the app starts.");
            expect(write.exit).not.toHaveBeenCalled();
            const check = setup(undefined, { ...adopted, [rules]: baselineOf({ [A]: 1 }) });
            main(["--base", "abc123"], check.deps);
            expect(check.io.error).not.toHaveBeenCalled();
            expect(check.io.log).toHaveBeenCalledWith("ouro-source-rules: abc123 has no baseline; nothing to ratchet against.");
            expect(check.exit).not.toHaveBeenCalled();
        });
        it("does not treat a missing baseline as the first when the base already has the settings", () => {
            const refused = setup(undefined);
            refused.gitShow.mockImplementation(atBase({ [CONFIG_PATH]: "{}" }));
            main(["--write-baseline", "--base", "abc123"], refused.deps);
            expect(refused.writeFile).not.toHaveBeenCalled();
            expect(refused.io.error).toHaveBeenCalledWith(expect.stringContaining(`New hand-rolled control: ${A} (+1)`));
            expect(refused.exit).toHaveBeenCalledWith(1);
            const written = setup(undefined);
            written.gitShow.mockImplementation(atBase({ [CONFIG_PATH]: "{}" }));
            main(["--write-baseline", "--base", "abc123", "--allow-regression", "measured"], written.deps);
            expect(written.writeFile).toHaveBeenCalledWith(baselineFile, baselineOf({ [A]: 1 }));
        });
    });
    it("rejects --allow-regression or --base without a value, and unknown arguments", () => {
        for (const argv of [
            ["--write-baseline", "--allow-regression"],
            ["--write-baseline", "--allow-regression", "--x"],
            ["--base"],
            ["--base", "--write-baseline"],
            ["--nope"],
        ]) {
            const { deps, io, exit, writeFile } = setup(matching);
            main(argv, deps);
            expect(io.error).toHaveBeenCalledWith("Usage: node scripts/ouro-source-rules.mjs [--base <ref>] [--write-baseline [--allow-regression <reason>]]");
            expect(exit).toHaveBeenCalledWith(1);
            expect(writeFile).not.toHaveBeenCalled();
        }
    });
});
describe("defaults", () => {
    it("reads, lists and writes real files", () => {
        expect(defaultDeps.readFile("package.json")).toContain('"name"');
        expect(defaultDeps.readdir("registry/ouro/source-rules").map(String)).toContain("source-rules.mjs");
        const cache = path.join(process.cwd(), "node_modules", ".cache");
        mkdirSync(cache, { recursive: true });
        const directory = mkdtempSync(path.join(cache, "ouro-source-rules-"));
        try {
            defaultDeps.writeFile(path.join(directory, "baseline.json"), "{}\n");
            expect(readFileSync(path.join(directory, "baseline.json"), "utf8")).toBe("{}\n");
        }
        finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
    it("checks a real app with the default dependencies", () => {
        const cache = path.join(process.cwd(), "node_modules", ".cache");
        mkdirSync(cache, { recursive: true });
        const root = mkdtempSync(path.join(cache, "ouro-source-rules-app-"));
        try {
            mkdirSync(path.join(root, "src", "components", "ouro", "button"), { recursive: true });
            defaultDeps.writeFile(path.join(root, "src", "components", "ouro", "button", "button.tsx"), "export const Button = () => <button />;\n");
            defaultDeps.writeFile(path.join(root, "src", "app.tsx"), "export const App = () => <a href=\"/\">Home</a>;\n");
            defaultDeps.writeFile(path.join(root, "src", "app.css"), ".card:focus { color: red; }\n");
            const written = { log: vi.fn(), error: vi.fn() };
            main(["--write-baseline"], { root, io: written });
            expect(written.log).toHaveBeenCalledWith(`ouro-source-rules: wrote ${BASELINE_PATH} with 2 offender(s), 0 move(s) and 0 allowed regression(s); it is the first baseline, so it records where the app starts.`);
            const io = { log: vi.fn(), error: vi.fn() };
            main([], { root, io });
            expect(io.error).not.toHaveBeenCalled();
            expect(io.log).toHaveBeenCalledWith("ouro-source-rules: 2 file(s), 2 offender(s), all in the baseline.");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("ratchets a real repository against the base's own baseline, however the pull request moves it", () => {
        const cache = path.join(process.cwd(), "node_modules", ".cache");
        mkdirSync(cache, { recursive: true });
        const root = mkdtempSync(path.join(cache, "ouro-source-rules-git-"));
        const git = (...args) => {
            const result = spawnSync("git", ["-c", "user.email=kit@example.com", "-c", "user.name=Kit", "-c", "commit.gpgsign=false", ...args], { cwd: root, encoding: "utf8" });
            expect(result.status).toBe(0);
        };
        try {
            mkdirSync(path.join(root, "src"), { recursive: true });
            defaultDeps.writeFile(path.join(root, "src", "app.tsx"), "export const App = () => <a href=\"/\">Home</a>;\n");
            main(["--write-baseline"], { root, io: { log: vi.fn(), error: vi.fn() } });
            git("init", "--quiet");
            git("add", ".");
            git("commit", "--quiet", "-m", "base");
            git("tag", "base");
            defaultDeps.writeFile(path.join(root, "src", "more.tsx"), "export const More = () => <button>More</button>;\n");
            defaultDeps.writeFile(path.join(root, CONFIG_PATH), `${JSON.stringify({ baseline: "moved.json" })}\n`);
            main(["--write-baseline"], { root, io: { log: vi.fn(), error: vi.fn() } });
            const io = { log: vi.fn(), error: vi.fn() };
            const exit = vi.fn();
            main(["--base", "base"], { root, io, exit });
            expect(io.error).toHaveBeenCalledWith(expect.stringContaining(`moves the baseline from ${BASELINE_PATH} to moved.json`));
            expect(io.error).toHaveBeenCalledWith(expect.stringContaining("Regression against base: src/more.tsx::More::raw-button::button:: (+1)"));
            expect(exit).toHaveBeenCalledWith(1);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("reads the base from the app's own folder when the app sits below the repository root", () => {
        const cache = path.join(process.cwd(), "node_modules", ".cache");
        mkdirSync(cache, { recursive: true });
        const repo = mkdtempSync(path.join(cache, "ouro-source-rules-monorepo-"));
        const root = path.join(repo, "apps", "web");
        const git = (...args) => {
            const result = spawnSync("git", ["-c", "user.email=kit@example.com", "-c", "user.name=Kit", "-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
            expect(result.status).toBe(0);
        };
        const run = (argv) => {
            const io = { log: vi.fn(), error: vi.fn() };
            const exit = vi.fn();
            const writeFile = vi.fn();
            main(argv, { root, io, exit, writeFile });
            return { io, exit, writeFile };
        };
        try {
            mkdirSync(path.join(root, "src", "routes"), { recursive: true });
            defaultDeps.writeFile(path.join(root, "src", "app.tsx"), "export const App = () => <a href=\"/\">Home</a>;\n");
            defaultDeps.writeFile(path.join(root, "src", "routes", "page.tsx"), "export const Page = () => <button>Go</button>;\n");
            defaultDeps.writeFile(path.join(root, CONFIG_PATH), `${JSON.stringify({ baseline: "rules.json" })}\n`);
            main(["--write-baseline"], { root, io: { log: vi.fn(), error: vi.fn() } });
            git("init", "--quiet");
            git("add", ".");
            git("commit", "--quiet", "-m", "base");
            git("tag", "base");
            expect(defaultDeps.gitShow(root, "base", CONFIG_PATH)).toContain("rules.json");
            expect(defaultDeps.gitShow(root, "base", "src/")).toContain("app.tsx");
            const clean = run(["--base", "base"]);
            expect(clean.io.error).not.toHaveBeenCalled();
            expect(clean.io.log).toHaveBeenCalledWith("ouro-source-rules: ratchet against base: 0 allowed regression(s), 0 move(s).");
            // The pull request deletes the baseline to start over, and adds a control.
            const baseline = readFileSync(path.join(root, "rules.json"), "utf8");
            rmSync(path.join(root, "rules.json"));
            defaultDeps.writeFile(path.join(root, "src", "more.tsx"), "export const More = () => <button>More</button>;\n");
            const restart = run(["--write-baseline", "--base", "base"]);
            expect(restart.writeFile).not.toHaveBeenCalled();
            expect(restart.io.error).toHaveBeenCalledWith(expect.stringContaining("New hand-rolled control: src/more.tsx::More::raw-button::button:: (+1)"));
            expect(restart.exit).toHaveBeenCalledWith(1);
            // It moves the baseline instead.
            defaultDeps.writeFile(path.join(root, CONFIG_PATH), `${JSON.stringify({ baseline: "moved.json" })}\n`);
            defaultDeps.writeFile(path.join(root, "moved.json"), baseline);
            const moved = run(["--base", "base"]);
            expect(moved.io.error).toHaveBeenCalledWith(expect.stringContaining("moves the baseline from rules.json to moved.json"));
            expect(moved.io.error).toHaveBeenCalledWith(expect.stringContaining("Regression against base: src/more.tsx::More::raw-button::button:: (+1)"));
            expect(moved.exit).toHaveBeenCalledWith(1);
            // Or it narrows the scan so the control is not read.
            defaultDeps.writeFile(path.join(root, CONFIG_PATH), `${JSON.stringify({ baseline: "rules.json", exclude: ["src/routes/"] })}\n`);
            defaultDeps.writeFile(path.join(root, "rules.json"), baseline);
            rmSync(path.join(root, "src", "more.tsx"));
            const narrowed = run(["--base", "base"]);
            expect(narrowed.io.error).toHaveBeenCalledWith(expect.stringContaining("stops reading src/routes/ (exclude)"));
            expect(narrowed.exit).toHaveBeenCalledWith(1);
        }
        finally {
            rmSync(repo, { recursive: true, force: true });
        }
    });
    it("reads a baseline from git: present, missing at the ref, or an unknown ref", () => {
        expect(defaultDeps.gitShow(process.cwd(), "HEAD", "package.json")).toContain('"name"');
        expect(defaultDeps.gitShow(process.cwd(), "HEAD", "no-such-baseline.json")).toBeUndefined();
        expect(defaultDeps.gitShow(process.cwd(), "HEAD", "registry/ouro/")).toContain("source-rules/");
        expect(defaultDeps.gitShow(process.cwd(), "HEAD", "package.json/")).toBeUndefined();
        expect(() => defaultDeps.gitShow(process.cwd(), "refs/heads/no-such-ref-for-ouro-source-rules", BASELINE_PATH)).toThrow("ouro-source-rules: unknown base ref refs/heads/no-such-ref-for-ouro-source-rules");
    });
    it("defaultExit sets the process exit code", () => {
        defaultExit(1);
        expect(process.exitCode).toBe(1);
        process.exitCode = 0;
    });
});
describe("CLI entry guard", () => {
    it("isCliEntry is true only when argv1 resolves to this module", () => {
        expect(isCliEntry("file:///a/b.mjs", "/a/b.mjs")).toBe(true);
        expect(isCliEntry("file:///a/b.mjs", "/a/other.mjs")).toBe(false);
        expect(isCliEntry("file:///a/b.mjs", undefined)).toBe(false);
    });
    it("runCliIfEntry does nothing when this module is not the entry point", () => {
        const runMain = vi.fn();
        expect(runCliIfEntry({ moduleUrl: "file:///a/b.mjs", argv1: "/a/other.mjs", runMain })).toBe(false);
        expect(runMain).not.toHaveBeenCalled();
    });
    it("runCliIfEntry runs main with the process arguments when this module is the entry point", () => {
        const runMain = vi.fn();
        expect(runCliIfEntry({ moduleUrl: "file:///a/b.mjs", argv1: "/a/b.mjs", runMain })).toBe(true);
        expect(runMain).toHaveBeenCalledWith(process.argv.slice(2));
    });
    it("runCliIfEntry routes a throw to onError", () => {
        const failure = new Error("boom");
        const onError = vi.fn();
        runCliIfEntry({
            moduleUrl: "file:///a/b.mjs",
            argv1: "/a/b.mjs",
            runMain: () => {
                throw failure;
            },
            onError,
        });
        expect(onError).toHaveBeenCalledWith(failure);
    });
    it("defaultCliErrorHandler logs an Error's message and sets exitCode 1", () => {
        const io = { error: vi.fn() };
        defaultCliErrorHandler(new Error("boom"), io);
        expect(io.error).toHaveBeenCalledWith("boom");
        expect(process.exitCode).toBe(1);
        process.exitCode = 0;
    });
    it("defaultCliErrorHandler stringifies a non-Error throw", () => {
        const io = { error: vi.fn() };
        defaultCliErrorHandler("boom", io);
        expect(io.error).toHaveBeenCalledWith("boom");
        process.exitCode = 0;
    });
    it("defaultCliErrorHandler defaults to console", () => {
        defaultCliErrorHandler(new Error("boom-default"));
        expect(process.exitCode).toBe(1);
        process.exitCode = 0;
    });
});
