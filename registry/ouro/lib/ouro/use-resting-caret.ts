"use client";

function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { useInsertionEffect, useLayoutEffect, useRef } from "react";

/**
 * A native host's permission and wake bridge for a resting caret.
 *
 * Keep `enabled` false until the host knows assistive technology is off and can wake
 * before native menus, dictation and input methods receive input. An ordinary web page
 * must leave this feature off. See the resting-caret guide for the host contract.
 *
 * @example
 * const policy: RestingCaretOptions = {
 *   enabled: host.caretRestPermitted,
 *   subscribeWake: host.subscribeCaretWake,
 *   onHeld: host.setCaretHeld,
 * };
 */
export interface RestingCaretOptions {
  /** The host permits temporarily making the focused editor read-only. Set false for assistive technology, voice input or unknown accessibility state. */
  enabled: boolean;
  /** The host says the window is covered or minimised. */
  occluded?: boolean | undefined;
  /** Subscribe to native wake requests. Wake synchronously before forwarding native input or opening an editing menu. Return the unsubscribe function. Keep this callback stable. */
  subscribeWake: (wake: () => void) => () => void;
  /** Called synchronously on rest and wake. While true, the host must hold native input-method keys, request a wake and forward them only after false. Keep this callback stable. */
  onHeld: (held: boolean) => void;
}
type Box = HTMLInputElement | HTMLTextAreaElement | HTMLDivElement;
type TextBox = HTMLInputElement | HTMLTextAreaElement;
type Reason = "idle" | "covered" | "hidden" | "background" | "blinks" | "composing";
const textBox = stryMutAct_9fa48("0") ? () => undefined : (stryCov_9fa48("0"), (() => {
  const textBox = (box: Box): box is TextBox => stryMutAct_9fa48("3") ? box instanceof HTMLInputElement && box instanceof HTMLTextAreaElement : stryMutAct_9fa48("2") ? false : stryMutAct_9fa48("1") ? true : (stryCov_9fa48("1", "2", "3"), box instanceof HTMLInputElement || box instanceof HTMLTextAreaElement);
  return textBox;
})());
const wakeEvents = ["keydown", "pointerdown", "compositionstart", "compositionupdate", "compositionend", "beforeinput", "input", "paste", "dragenter", "dragover", "drop"] as const;
const afterIdle = 30_000;

// WebKit reconsiders its blink timer only when the selection changes. Restore it in
// the same task, including direction and scroll, without moving DOM focus.
function reconsider(box: Box) {
  if (stryMutAct_9fa48("4")) {
    {}
  } else {
    stryCov_9fa48("4");
    const {
      scrollTop,
      scrollLeft
    } = box;
    if (stryMutAct_9fa48("6") ? false : stryMutAct_9fa48("5") ? true : (stryCov_9fa48("5", "6"), textBox(box))) {
      if (stryMutAct_9fa48("7")) {
        {}
      } else {
        stryCov_9fa48("7");
        const start = box.selectionStart;
        if (stryMutAct_9fa48("10") ? start !== null : stryMutAct_9fa48("9") ? false : stryMutAct_9fa48("8") ? true : (stryCov_9fa48("8", "9", "10"), start === null)) return;
        const end = box.selectionEnd!;
        const direction = box.selectionDirection!;
        if (stryMutAct_9fa48("12") ? false : stryMutAct_9fa48("11") ? true : (stryCov_9fa48("11", "12"), box.value.length)) box.setSelectionRange((stryMutAct_9fa48("16") ? start !== 0 : stryMutAct_9fa48("15") ? false : stryMutAct_9fa48("14") ? true : (stryCov_9fa48("14", "15", "16"), start === 0)) ? 1 : stryMutAct_9fa48("17") ? start + 1 : (stryCov_9fa48("17"), start - 1), (stryMutAct_9fa48("20") ? start !== 0 : stryMutAct_9fa48("19") ? false : stryMutAct_9fa48("18") ? true : (stryCov_9fa48("18", "19", "20"), start === 0)) ? 1 : stryMutAct_9fa48("21") ? start + 1 : (stryCov_9fa48("21"), start - 1));else stryMutAct_9fa48("22") ? box.ownerDocument.getSelection().collapse(box.parentNode, 0) : (stryCov_9fa48("22"), box.ownerDocument.getSelection()?.collapse(box.parentNode, 0));
        if (stryMutAct_9fa48("23")) {
          ;
        } else {
          stryCov_9fa48("23");
          box.setSelectionRange(start, end, direction);
        }
      }
    } else {
      if (stryMutAct_9fa48("24")) {
        {}
      } else {
        stryCov_9fa48("24");
        const selection = box.ownerDocument.getSelection();
        if (stryMutAct_9fa48("27") ? selection?.anchorNode && selection.focusNode || box.contains(selection.anchorNode) : stryMutAct_9fa48("26") ? false : stryMutAct_9fa48("25") ? true : (stryCov_9fa48("25", "26", "27"), (stryMutAct_9fa48("29") ? selection?.anchorNode || selection.focusNode : stryMutAct_9fa48("28") ? true : (stryCov_9fa48("28", "29"), (stryMutAct_9fa48("30") ? selection.anchorNode : (stryCov_9fa48("30"), selection?.anchorNode)) && selection.focusNode)) && box.contains(selection.anchorNode))) {
          if (stryMutAct_9fa48("31")) {
            {}
          } else {
            stryCov_9fa48("31");
            const {
              anchorNode,
              anchorOffset,
              focusNode,
              focusOffset
            } = selection;
            if (stryMutAct_9fa48("32")) {
              ;
            } else {
              stryCov_9fa48("32");
              selection.removeAllRanges();
            }
            if (stryMutAct_9fa48("33")) {
              ;
            } else {
              stryCov_9fa48("33");
              selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
            }
          }
        }
      }
    }
    box.scrollTop = scrollTop;
    box.scrollLeft = scrollLeft;
  }
}
function caretRect(box: Box): {
  left: number;
  top: number;
  height: number;
} | null {
  if (stryMutAct_9fa48("34")) {
    {}
  } else {
    stryCov_9fa48("34");
    const style = getComputedStyle(box);
    const bounds = box.getBoundingClientRect();
    if (stryMutAct_9fa48("37") ? false : stryMutAct_9fa48("36") ? true : stryMutAct_9fa48("35") ? textBox(box) : (stryCov_9fa48("35", "36", "37"), !textBox(box))) {
      if (stryMutAct_9fa48("38")) {
        {}
      } else {
        stryCov_9fa48("38");
        const selection = box.ownerDocument.getSelection();
        if (stryMutAct_9fa48("41") ? (!selection?.isCollapsed || !selection.rangeCount) && !box.contains(selection.anchorNode) : stryMutAct_9fa48("40") ? false : stryMutAct_9fa48("39") ? true : (stryCov_9fa48("39", "40", "41"), (stryMutAct_9fa48("43") ? !selection?.isCollapsed && !selection.rangeCount : stryMutAct_9fa48("42") ? false : (stryCov_9fa48("42", "43"), (stryMutAct_9fa48("44") ? selection?.isCollapsed : (stryCov_9fa48("44"), !(stryMutAct_9fa48("45") ? selection.isCollapsed : (stryCov_9fa48("45"), selection?.isCollapsed)))) || (stryMutAct_9fa48("46") ? selection.rangeCount : (stryCov_9fa48("46"), !selection.rangeCount)))) || (stryMutAct_9fa48("47") ? box.contains(selection.anchorNode) : (stryCov_9fa48("47"), !box.contains(selection.anchorNode))))) return null;
        const range = selection.getRangeAt(0);
        let rect = range.getClientRects()[0];
        if (stryMutAct_9fa48("50") ? false : stryMutAct_9fa48("49") ? true : stryMutAct_9fa48("48") ? rect?.height : (stryCov_9fa48("48", "49", "50"), !(stryMutAct_9fa48("51") ? rect.height : (stryCov_9fa48("51"), rect?.height)))) {
          if (stryMutAct_9fa48("52")) {
            {}
          } else {
            stryCov_9fa48("52");
            const node = range.startContainer;
            const adjacent = (stryMutAct_9fa48("55") ? node.nodeType !== Node.ELEMENT_NODE : stryMutAct_9fa48("54") ? false : stryMutAct_9fa48("53") ? true : (stryCov_9fa48("53", "54", "55"), node.nodeType === Node.ELEMENT_NODE)) ? stryMutAct_9fa48("56") ? node.childNodes[range.startOffset] && node.childNodes[range.startOffset - 1] : (stryCov_9fa48("56"), node.childNodes[range.startOffset] ?? node.childNodes[stryMutAct_9fa48("57") ? range.startOffset + 1 : (stryCov_9fa48("57"), range.startOffset - 1)]) : node;
            if (stryMutAct_9fa48("59") ? false : stryMutAct_9fa48("58") ? true : (stryCov_9fa48("58", "59"), adjacent)) {
              if (stryMutAct_9fa48("60")) {
                {}
              } else {
                stryCov_9fa48("60");
                const line = box.ownerDocument.createRange();
                if (stryMutAct_9fa48("61")) {
                  ;
                } else {
                  stryCov_9fa48("61");
                  line.selectNode(adjacent);
                }
                rect = line.getClientRects()[0];
              }
            }
          }
        }
        if (stryMutAct_9fa48("64") ? rect.height : stryMutAct_9fa48("63") ? false : stryMutAct_9fa48("62") ? true : (stryCov_9fa48("62", "63", "64"), rect?.height)) return rect;
        return stryMutAct_9fa48("65") ? {} : (stryCov_9fa48("65"), {
          left: bounds.left,
          top: stryMutAct_9fa48("66") ? bounds.top + parseFloat(style.borderTopWidth) - parseFloat(style.paddingTop) : (stryCov_9fa48("66"), (stryMutAct_9fa48("67") ? bounds.top - parseFloat(style.borderTopWidth) : (stryCov_9fa48("67"), bounds.top + parseFloat(style.borderTopWidth))) + parseFloat(style.paddingTop)),
          height: parseFloat(style.fontSize)
        });
      }
    }
    if (stryMutAct_9fa48("70") ? box.selectionStart === null && box.selectionStart !== box.selectionEnd : stryMutAct_9fa48("69") ? false : stryMutAct_9fa48("68") ? true : (stryCov_9fa48("68", "69", "70"), (stryMutAct_9fa48("72") ? box.selectionStart !== null : stryMutAct_9fa48("71") ? false : (stryCov_9fa48("71", "72"), box.selectionStart === null)) || (stryMutAct_9fa48("74") ? box.selectionStart === box.selectionEnd : stryMutAct_9fa48("73") ? false : (stryCov_9fa48("73", "74"), box.selectionStart !== box.selectionEnd)))) return null;
    const mirror = box.ownerDocument.createElement(stryMutAct_9fa48("75") ? "" : (stryCov_9fa48("75"), "div"));
    // Copy the app's typography, direction, alignment and wrapping, not a second set of tokens.
    for (const property of style) if (stryMutAct_9fa48("76")) {
      ;
    } else {
      stryCov_9fa48("76");
      mirror.style.setProperty(property, style.getPropertyValue(property));
    }
    Object.assign(mirror.style, stryMutAct_9fa48("78") ? {} : (stryCov_9fa48("78"), {
      position: stryMutAct_9fa48("79") ? "" : (stryCov_9fa48("79"), "fixed"),
      visibility: stryMutAct_9fa48("80") ? "" : (stryCov_9fa48("80"), "hidden"),
      transform: stryMutAct_9fa48("81") ? "" : (stryCov_9fa48("81"), "none"),
      transition: stryMutAct_9fa48("82") ? "" : (stryCov_9fa48("82"), "none"),
      animation: stryMutAct_9fa48("83") ? "" : (stryCov_9fa48("83"), "none"),
      whiteSpace: box instanceof HTMLTextAreaElement ? stryMutAct_9fa48("84") ? "" : (stryCov_9fa48("84"), "pre-wrap") : stryMutAct_9fa48("85") ? "" : (stryCov_9fa48("85"), "pre"),
      overflowWrap: stryMutAct_9fa48("86") ? "" : (stryCov_9fa48("86"), "break-word"),
      pointerEvents: stryMutAct_9fa48("87") ? "" : (stryCov_9fa48("87"), "none")
    }));
    mirror.setAttribute(stryMutAct_9fa48("89") ? "" : (stryCov_9fa48("89"), "aria-hidden"), stryMutAct_9fa48("90") ? "" : (stryCov_9fa48("90"), "true"));
    mirror.textContent = stryMutAct_9fa48("91") ? box.value : (stryCov_9fa48("91"), box.value.slice(0, box.selectionStart));
    const marker = box.ownerDocument.createElement(stryMutAct_9fa48("92") ? "" : (stryCov_9fa48("92"), "span"));
    marker.textContent = stryMutAct_9fa48("95") ? box.value.slice(box.selectionStart) && "\u200b" : stryMutAct_9fa48("94") ? false : stryMutAct_9fa48("93") ? true : (stryCov_9fa48("93", "94", "95"), (stryMutAct_9fa48("96") ? box.value : (stryCov_9fa48("96"), box.value.slice(box.selectionStart))) || (stryMutAct_9fa48("97") ? "" : (stryCov_9fa48("97"), "\u200b")));
    if (stryMutAct_9fa48("98")) {
      ;
    } else {
      stryCov_9fa48("98");
      mirror.append(marker);
    }
    if (stryMutAct_9fa48("99")) {
      ;
    } else {
      stryCov_9fa48("99");
      box.ownerDocument.body.append(mirror);
    }
    const rect = marker.getClientRects()[0]!;
    const origin = mirror.getBoundingClientRect();
    const lineHeight = parseFloat(style.lineHeight);
    const centre = box instanceof HTMLInputElement ? stryMutAct_9fa48("100") ? (box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - lineHeight) * 2 : (stryCov_9fa48("100"), (stryMutAct_9fa48("101") ? box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) + lineHeight : (stryCov_9fa48("101"), (stryMutAct_9fa48("102") ? box.clientHeight - parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) : (stryCov_9fa48("102"), (stryMutAct_9fa48("103") ? box.clientHeight + parseFloat(style.paddingTop) : (stryCov_9fa48("103"), box.clientHeight - parseFloat(style.paddingTop))) - parseFloat(style.paddingBottom))) - lineHeight)) / 2) : 0;
    const left = stryMutAct_9fa48("104") ? bounds.left + (style.direction === "rtl" ? rect.right : rect.left) - origin.left + box.scrollLeft : (stryCov_9fa48("104"), (stryMutAct_9fa48("105") ? bounds.left + (style.direction === "rtl" ? rect.right : rect.left) + origin.left : (stryCov_9fa48("105"), (stryMutAct_9fa48("106") ? bounds.left - (style.direction === "rtl" ? rect.right : rect.left) : (stryCov_9fa48("106"), bounds.left + ((stryMutAct_9fa48("109") ? style.direction !== "rtl" : stryMutAct_9fa48("108") ? false : stryMutAct_9fa48("107") ? true : (stryCov_9fa48("107", "108", "109"), style.direction === (stryMutAct_9fa48("110") ? "" : (stryCov_9fa48("110"), "rtl")))) ? rect.right : rect.left))) - origin.left)) - box.scrollLeft);
    const top = stryMutAct_9fa48("111") ? bounds.top + rect.top - origin.top - box.scrollTop - centre : (stryCov_9fa48("111"), (stryMutAct_9fa48("112") ? bounds.top + rect.top - origin.top + box.scrollTop : (stryCov_9fa48("112"), (stryMutAct_9fa48("113") ? bounds.top + rect.top + origin.top : (stryCov_9fa48("113"), (stryMutAct_9fa48("114") ? bounds.top - rect.top : (stryCov_9fa48("114"), bounds.top + rect.top)) - origin.top)) - box.scrollTop)) + centre);
    const height = rect.height;
    if (stryMutAct_9fa48("115")) {
      ;
    } else {
      stryCov_9fa48("115");
      mirror.remove();
    }
    return stryMutAct_9fa48("116") ? {} : (stryCov_9fa48("116"), {
      left,
      top,
      height
    });
  }
}

/**
 * Rest an existing editor's caret under a native host's explicit safety policy.
 *
 * Install this helper separately; omit it on ordinary web pages. Pass the actual editor
 * through a state callback ref, including when Composer changes between plain and rich text.
 * Pass the same `readOnly` and `disabled` state to the hook and the editor. Pass `inputType`
 * too when changing a TextField's native type.
 *
 * @example
 * const [box, setBox] = useState<HTMLTextAreaElement | null>(null);
 * useRestingCaret(box, hostCaretPolicy, readOnly, disabled);
 * <TextArea ref={setBox} label="Draft" readOnly={readOnly} disabled={disabled} />
 */
export function useRestingCaret(box: Box | null, policy: RestingCaretOptions | undefined, readOnly: boolean, disabled: boolean, inputType?: string) {
  if (stryMutAct_9fa48("117")) {
    {}
  } else {
    stryCov_9fa48("117");
    const current = useRef<{
      cover: (covered: boolean) => void;
      refresh: () => void;
    } | null>(null);
    const enabled = stryMutAct_9fa48("120") ? policy?.enabled === true && !readOnly || !disabled : stryMutAct_9fa48("119") ? false : stryMutAct_9fa48("118") ? true : (stryCov_9fa48("118", "119", "120"), (stryMutAct_9fa48("122") ? policy?.enabled === true || !readOnly : stryMutAct_9fa48("121") ? true : (stryCov_9fa48("121", "122"), (stryMutAct_9fa48("124") ? policy?.enabled !== true : stryMutAct_9fa48("123") ? true : (stryCov_9fa48("123", "124"), (stryMutAct_9fa48("125") ? policy.enabled : (stryCov_9fa48("125"), policy?.enabled)) === (stryMutAct_9fa48("126") ? false : (stryCov_9fa48("126"), true)))) && (stryMutAct_9fa48("127") ? readOnly : (stryCov_9fa48("127"), !readOnly)))) && (stryMutAct_9fa48("128") ? disabled : (stryCov_9fa48("128"), !disabled)));
    const occluded = stryMutAct_9fa48("129") ? policy.occluded : (stryCov_9fa48("129"), policy?.occluded);
    const subscribeWake = stryMutAct_9fa48("130") ? policy.subscribeWake : (stryCov_9fa48("130"), policy?.subscribeWake);
    const onHeld = stryMutAct_9fa48("131") ? policy.onHeld : (stryCov_9fa48("131"), policy?.onHeld);
    const caller = useRef<{
      readOnly: boolean;
      disabled: boolean;
      occluded: boolean | undefined;
    } | undefined>(undefined);
    // Layout cleanups run after React writes the new readOnly prop. Publish the committed
    // ownership first, so lifting our hold cannot overwrite that new caller-owned state.
    useInsertionEffect(() => {
      if (stryMutAct_9fa48("133")) {
        {}
      } else {
        stryCov_9fa48("133");
        caller.current = stryMutAct_9fa48("134") ? {} : (stryCov_9fa48("134"), {
          readOnly,
          disabled,
          occluded
        });
      }
    }, stryMutAct_9fa48("135") ? [] : (stryCov_9fa48("135"), [readOnly, disabled, occluded]));
    if (stryMutAct_9fa48("136")) {
      ;
    } else {
      stryCov_9fa48("136");
      useLayoutEffect(() => {
        if (stryMutAct_9fa48("137")) {
          {}
        } else {
          stryCov_9fa48("137");
          if (stryMutAct_9fa48("140") ? (!enabled || !box || !box.isConnected || !subscribeWake) && !onHeld : stryMutAct_9fa48("139") ? false : stryMutAct_9fa48("138") ? true : (stryCov_9fa48("138", "139", "140"), (stryMutAct_9fa48("142") ? (!enabled || !box || !box.isConnected) && !subscribeWake : stryMutAct_9fa48("141") ? false : (stryCov_9fa48("141", "142"), (stryMutAct_9fa48("144") ? (!enabled || !box) && !box.isConnected : stryMutAct_9fa48("143") ? false : (stryCov_9fa48("143", "144"), (stryMutAct_9fa48("146") ? !enabled && !box : stryMutAct_9fa48("145") ? false : (stryCov_9fa48("145", "146"), (stryMutAct_9fa48("147") ? enabled : (stryCov_9fa48("147"), !enabled)) || (stryMutAct_9fa48("148") ? box : (stryCov_9fa48("148"), !box)))) || (stryMutAct_9fa48("149") ? box.isConnected : (stryCov_9fa48("149"), !box.isConnected)))) || (stryMutAct_9fa48("150") ? subscribeWake : (stryCov_9fa48("150"), !subscribeWake)))) || (stryMutAct_9fa48("151") ? onHeld : (stryCov_9fa48("151"), !onHeld)))) return;
          // Date, email and other native editors expose no selection to preserve.
          if (stryMutAct_9fa48("154") ? textBox(box) || box.selectionStart === null : stryMutAct_9fa48("153") ? false : stryMutAct_9fa48("152") ? true : (stryCov_9fa48("152", "153", "154"), textBox(box) && (stryMutAct_9fa48("156") ? box.selectionStart !== null : stryMutAct_9fa48("155") ? true : (stryCov_9fa48("155", "156"), box.selectionStart === null)))) return;
          const doc = box.ownerDocument;
          const win = doc.defaultView!;
          const nativeCaret = win.CSS.supports(stryMutAct_9fa48("157") ? "" : (stryCov_9fa48("157"), "caret-animation"), stryMutAct_9fa48("158") ? "" : (stryCov_9fa48("158"), "manual"));
          let animation: string;
          let animationPriority: string;
          const macWebKit = stryMutAct_9fa48("161") ? win.navigator.platform.startsWith("Mac") || win.navigator.vendor === "Apple Computer, Inc." : stryMutAct_9fa48("160") ? false : stryMutAct_9fa48("159") ? true : (stryCov_9fa48("159", "160", "161"), (stryMutAct_9fa48("162") ? win.navigator.platform.endsWith("Mac") : (stryCov_9fa48("162"), win.navigator.platform.startsWith(stryMutAct_9fa48("163") ? "" : (stryCov_9fa48("163"), "Mac")))) && (stryMutAct_9fa48("165") ? win.navigator.vendor !== "Apple Computer, Inc." : stryMutAct_9fa48("164") ? true : (stryCov_9fa48("164", "165"), win.navigator.vendor === (stryMutAct_9fa48("166") ? "" : (stryCov_9fa48("166"), "Apple Computer, Inc.")))));
          let active = stryMutAct_9fa48("167") ? false : (stryCov_9fa48("167"), true);
          let held = stryMutAct_9fa48("168") ? true : (stryCov_9fa48("168"), false);
          let composing = stryMutAct_9fa48("169") ? true : (stryCov_9fa48("169"), false);
          let covered = caller.current!.occluded;
          let lastInput = Date.now();
          let timer: ReturnType<typeof setTimeout> | undefined;
          let caret: HTMLSpanElement | undefined;
          const tabIndex = box.getAttribute(stryMutAct_9fa48("170") ? "" : (stryCov_9fa48("170"), "tabindex"));
          const clearTimer = () => {
            if (stryMutAct_9fa48("171")) {
              {}
            } else {
              stryCov_9fa48("171");
              if (stryMutAct_9fa48("172")) {
                ;
              } else {
                stryCov_9fa48("172");
                clearTimeout(timer);
              }
              timer = undefined;
            }
          };
          const draw = () => {
            if (stryMutAct_9fa48("173")) {
              {}
            } else {
              stryCov_9fa48("173");
              if (stryMutAct_9fa48("176") ? false : stryMutAct_9fa48("175") ? true : stryMutAct_9fa48("174") ? caret : (stryCov_9fa48("174", "175", "176"), !caret)) return;
              const rect = caretRect(box);
              const field = box.getBoundingClientRect();
              caret.hidden = stryMutAct_9fa48("177") ? true : (stryCov_9fa48("177"), false);
              caret.style.left = stryMutAct_9fa48("178") ? "" : (stryCov_9fa48("178"), "0px");
              caret.style.top = stryMutAct_9fa48("179") ? "" : (stryCov_9fa48("179"), "0px");
              const origin = caret.getBoundingClientRect();
              const style = getComputedStyle(box);
              const visible = stryMutAct_9fa48("182") ? rect && rect.top >= field.top && rect.top + rect.height <= field.bottom + 1 && rect.left >= field.left || rect.left <= field.right : stryMutAct_9fa48("181") ? false : stryMutAct_9fa48("180") ? true : (stryCov_9fa48("180", "181", "182"), (stryMutAct_9fa48("184") ? rect && rect.top >= field.top && rect.top + rect.height <= field.bottom + 1 || rect.left >= field.left : stryMutAct_9fa48("183") ? true : (stryCov_9fa48("183", "184"), (stryMutAct_9fa48("186") ? rect && rect.top >= field.top || rect.top + rect.height <= field.bottom + 1 : stryMutAct_9fa48("185") ? true : (stryCov_9fa48("185", "186"), (stryMutAct_9fa48("188") ? rect || rect.top >= field.top : stryMutAct_9fa48("187") ? true : (stryCov_9fa48("187", "188"), rect && (stryMutAct_9fa48("191") ? rect.top < field.top : stryMutAct_9fa48("190") ? rect.top > field.top : stryMutAct_9fa48("189") ? true : (stryCov_9fa48("189", "190", "191"), rect.top >= field.top)))) && (stryMutAct_9fa48("194") ? rect.top + rect.height > field.bottom + 1 : stryMutAct_9fa48("193") ? rect.top + rect.height < field.bottom + 1 : stryMutAct_9fa48("192") ? true : (stryCov_9fa48("192", "193", "194"), (stryMutAct_9fa48("195") ? rect.top - rect.height : (stryCov_9fa48("195"), rect.top + rect.height)) <= (stryMutAct_9fa48("196") ? field.bottom - 1 : (stryCov_9fa48("196"), field.bottom + 1)))))) && (stryMutAct_9fa48("199") ? rect.left < field.left : stryMutAct_9fa48("198") ? rect.left > field.left : stryMutAct_9fa48("197") ? true : (stryCov_9fa48("197", "198", "199"), rect.left >= field.left)))) && (stryMutAct_9fa48("202") ? rect.left > field.right : stryMutAct_9fa48("201") ? rect.left < field.right : stryMutAct_9fa48("200") ? true : (stryCov_9fa48("200", "201", "202"), rect.left <= field.right)));
              caret.hidden = stryMutAct_9fa48("203") ? visible : (stryCov_9fa48("203"), !visible);
              if (stryMutAct_9fa48("205") ? false : stryMutAct_9fa48("204") ? true : (stryCov_9fa48("204", "205"), visible)) {
                if (stryMutAct_9fa48("206")) {
                  {}
                } else {
                  stryCov_9fa48("206");
                  const x = stryMutAct_9fa48("207") ? Math.min(macWebKit ? Math.floor(rect.left - field.left - 0.25) : Math.ceil(rect.left - field.left - 0.01), parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)) : (stryCov_9fa48("207"), Math.max(macWebKit ? Math.floor(stryMutAct_9fa48("208") ? rect.left - field.left + 0.25 : (stryCov_9fa48("208"), (stryMutAct_9fa48("209") ? rect.left + field.left : (stryCov_9fa48("209"), rect.left - field.left)) - 0.25)) : Math.ceil(stryMutAct_9fa48("210") ? rect.left - field.left + 0.01 : (stryCov_9fa48("210"), (stryMutAct_9fa48("211") ? rect.left + field.left : (stryCov_9fa48("211"), rect.left - field.left)) - 0.01)), stryMutAct_9fa48("212") ? parseFloat(style.borderLeftWidth) - parseFloat(style.paddingLeft) : (stryCov_9fa48("212"), parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft))));
                  const inset = stryMutAct_9fa48("213") ? parseFloat(style.paddingTop) - parseFloat(style.borderTopWidth) : (stryCov_9fa48("213"), parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth));
                  const y = stryMutAct_9fa48("214") ? Math.floor(rect.top - field.top - inset + 0.01) - inset : (stryCov_9fa48("214"), Math.floor(stryMutAct_9fa48("215") ? rect.top - field.top - inset - 0.01 : (stryCov_9fa48("215"), (stryMutAct_9fa48("216") ? rect.top - field.top + inset : (stryCov_9fa48("216"), (stryMutAct_9fa48("217") ? rect.top + field.top : (stryCov_9fa48("217"), rect.top - field.top)) - inset)) + 0.01)) + inset);
                  const snap = stryMutAct_9fa48("218") ? () => undefined : (stryCov_9fa48("218"), (() => {
                    const snap = (value: number) => stryMutAct_9fa48("219") ? Math.round(value * win.devicePixelRatio) * win.devicePixelRatio : (stryCov_9fa48("219"), Math.round(stryMutAct_9fa48("220") ? value / win.devicePixelRatio : (stryCov_9fa48("220"), value * win.devicePixelRatio)) / win.devicePixelRatio);
                    return snap;
                  })());
                  Object.assign(caret.style, stryMutAct_9fa48("222") ? {} : (stryCov_9fa48("222"), {
                    left: stryMutAct_9fa48("223") ? `` : (stryCov_9fa48("223"), `${stryMutAct_9fa48("224") ? snap(field.left + x) + origin.left : (stryCov_9fa48("224"), snap(stryMutAct_9fa48("225") ? field.left - x : (stryCov_9fa48("225"), field.left + x)) - origin.left)}px`),
                    top: stryMutAct_9fa48("226") ? `` : (stryCov_9fa48("226"), `${stryMutAct_9fa48("227") ? snap(field.top + y) + origin.top : (stryCov_9fa48("227"), snap(stryMutAct_9fa48("228") ? field.top - y : (stryCov_9fa48("228"), field.top + y)) - origin.top)}px`),
                    height: stryMutAct_9fa48("229") ? `` : (stryCov_9fa48("229"), `${Math.round(rect.height)}px`),
                    backgroundColor: style.caretColor
                  }));
                }
              }
            }
          };
          const lift = () => {
            if (stryMutAct_9fa48("230")) {
              {}
            } else {
              stryCov_9fa48("230");
              if (stryMutAct_9fa48("233") ? false : stryMutAct_9fa48("232") ? true : stryMutAct_9fa48("231") ? held : (stryCov_9fa48("231", "232", "233"), !held)) return;
              held = stryMutAct_9fa48("234") ? true : (stryCov_9fa48("234"), false);
              if (stryMutAct_9fa48("236") ? false : stryMutAct_9fa48("235") ? true : (stryCov_9fa48("235", "236"), nativeCaret)) {
                if (stryMutAct_9fa48("237")) {
                  {}
                } else {
                  stryCov_9fa48("237");
                  if (stryMutAct_9fa48("240") ? box.style.getPropertyValue("caret-animation") !== "manual" : stryMutAct_9fa48("239") ? false : stryMutAct_9fa48("238") ? true : (stryCov_9fa48("238", "239", "240"), box.style.getPropertyValue(stryMutAct_9fa48("241") ? "" : (stryCov_9fa48("241"), "caret-animation")) === (stryMutAct_9fa48("242") ? "" : (stryCov_9fa48("242"), "manual")))) {
                    if (stryMutAct_9fa48("243")) {
                      {}
                    } else {
                      stryCov_9fa48("243");
                      box.style.setProperty(stryMutAct_9fa48("245") ? "" : (stryCov_9fa48("245"), "caret-animation"), animation, animationPriority);
                    }
                  }
                }
              } else {
                if (stryMutAct_9fa48("246")) {
                  {}
                } else {
                  stryCov_9fa48("246");
                  if (stryMutAct_9fa48("248") ? false : stryMutAct_9fa48("247") ? true : (stryCov_9fa48("247", "248"), textBox(box))) box.readOnly = caller.current!.readOnly;else {
                    if (stryMutAct_9fa48("249")) {
                      {}
                    } else {
                      stryCov_9fa48("249");
                      box.contentEditable = String(stryMutAct_9fa48("252") ? !caller.current!.readOnly || !caller.current!.disabled : stryMutAct_9fa48("251") ? false : stryMutAct_9fa48("250") ? true : (stryCov_9fa48("250", "251", "252"), (stryMutAct_9fa48("253") ? caller.current!.readOnly : (stryCov_9fa48("253"), !caller.current!.readOnly)) && (stryMutAct_9fa48("254") ? caller.current!.disabled : (stryCov_9fa48("254"), !caller.current!.disabled))));
                      if (stryMutAct_9fa48("257") ? tabIndex !== null : stryMutAct_9fa48("256") ? false : stryMutAct_9fa48("255") ? true : (stryCov_9fa48("255", "256", "257"), tabIndex === null)) {
                        if (stryMutAct_9fa48("258")) {
                          {}
                        } else {
                          stryCov_9fa48("258");
                          if (stryMutAct_9fa48("261") ? !caller.current!.readOnly && caller.current!.disabled : stryMutAct_9fa48("260") ? false : stryMutAct_9fa48("259") ? true : (stryCov_9fa48("259", "260", "261"), (stryMutAct_9fa48("262") ? caller.current!.readOnly : (stryCov_9fa48("262"), !caller.current!.readOnly)) || caller.current!.disabled)) box.removeAttribute(stryMutAct_9fa48("264") ? "" : (stryCov_9fa48("264"), "tabindex"));
                        }
                      } else box.setAttribute(stryMutAct_9fa48("266") ? "" : (stryCov_9fa48("266"), "tabindex"), tabIndex);
                    }
                  }
                  if (stryMutAct_9fa48("267")) {
                    ;
                  } else {
                    stryCov_9fa48("267");
                    reconsider(box);
                  }
                }
              }
              stryMutAct_9fa48("268") ? caret.remove() : (stryCov_9fa48("268"), caret?.remove());
              caret = undefined;
              onHeld(stryMutAct_9fa48("270") ? true : (stryCov_9fa48("270"), false));
            }
          };
          const update = () => {
            if (stryMutAct_9fa48("271")) {
              {}
            } else {
              stryCov_9fa48("271");
              if (stryMutAct_9fa48("274") ? false : stryMutAct_9fa48("273") ? true : stryMutAct_9fa48("272") ? active : (stryCov_9fa48("272", "273", "274"), !active)) return;
              if (stryMutAct_9fa48("275")) {
                ;
              } else {
                stryCov_9fa48("275");
                clearTimer();
              }
              const focused = stryMutAct_9fa48("278") ? doc.activeElement !== box : stryMutAct_9fa48("277") ? false : stryMutAct_9fa48("276") ? true : (stryCov_9fa48("276", "277", "278"), doc.activeElement === box);
              const visible = stryMutAct_9fa48("281") ? doc.visibilityState === "hidden" : stryMutAct_9fa48("280") ? false : stryMutAct_9fa48("279") ? true : (stryCov_9fa48("279", "280", "281"), doc.visibilityState !== (stryMutAct_9fa48("282") ? "" : (stryCov_9fa48("282"), "hidden")));
              const foreground = doc.hasFocus();
              const idle = stryMutAct_9fa48("286") ? Date.now() - lastInput < afterIdle : stryMutAct_9fa48("285") ? Date.now() - lastInput > afterIdle : stryMutAct_9fa48("284") ? false : stryMutAct_9fa48("283") ? true : (stryCov_9fa48("283", "284", "285", "286"), (stryMutAct_9fa48("287") ? Date.now() + lastInput : (stryCov_9fa48("287"), Date.now() - lastInput)) >= afterIdle);
              const reason: Reason = composing ? stryMutAct_9fa48("288") ? "" : (stryCov_9fa48("288"), "composing") : (stryMutAct_9fa48("289") ? visible : (stryCov_9fa48("289"), !visible)) ? stryMutAct_9fa48("290") ? "" : (stryCov_9fa48("290"), "hidden") : (stryMutAct_9fa48("291") ? foreground : (stryCov_9fa48("291"), !foreground)) ? stryMutAct_9fa48("292") ? "" : (stryCov_9fa48("292"), "background") : covered ? stryMutAct_9fa48("293") ? "" : (stryCov_9fa48("293"), "covered") : idle ? stryMutAct_9fa48("294") ? "" : (stryCov_9fa48("294"), "idle") : stryMutAct_9fa48("295") ? "" : (stryCov_9fa48("295"), "blinks");
              box.dataset.caretRest = focused ? reason : stryMutAct_9fa48("296") ? "" : (stryCov_9fa48("296"), "no-caret");
              if (stryMutAct_9fa48("299") ? focused && !composing && visible && foreground && !covered || !idle : stryMutAct_9fa48("298") ? false : stryMutAct_9fa48("297") ? true : (stryCov_9fa48("297", "298", "299"), (stryMutAct_9fa48("301") ? focused && !composing && visible && foreground || !covered : stryMutAct_9fa48("300") ? true : (stryCov_9fa48("300", "301"), (stryMutAct_9fa48("303") ? focused && !composing && visible || foreground : stryMutAct_9fa48("302") ? true : (stryCov_9fa48("302", "303"), (stryMutAct_9fa48("305") ? focused && !composing || visible : stryMutAct_9fa48("304") ? true : (stryCov_9fa48("304", "305"), (stryMutAct_9fa48("307") ? focused || !composing : stryMutAct_9fa48("306") ? true : (stryCov_9fa48("306", "307"), focused && (stryMutAct_9fa48("308") ? composing : (stryCov_9fa48("308"), !composing)))) && visible)) && foreground)) && (stryMutAct_9fa48("309") ? covered : (stryCov_9fa48("309"), !covered)))) && (stryMutAct_9fa48("310") ? idle : (stryCov_9fa48("310"), !idle)))) {
                if (stryMutAct_9fa48("311")) {
                  {}
                } else {
                  stryCov_9fa48("311");
                  timer = setTimeout(update, stryMutAct_9fa48("312") ? afterIdle + (Date.now() - lastInput) : (stryCov_9fa48("312"), afterIdle - (stryMutAct_9fa48("313") ? Date.now() + lastInput : (stryCov_9fa48("313"), Date.now() - lastInput))));
                }
              }
              if (stryMutAct_9fa48("316") ? (!focused || composing) && visible && (!foreground || !covered && !idle) : stryMutAct_9fa48("315") ? false : stryMutAct_9fa48("314") ? true : (stryCov_9fa48("314", "315", "316"), (stryMutAct_9fa48("318") ? !focused && composing : stryMutAct_9fa48("317") ? false : (stryCov_9fa48("317", "318"), (stryMutAct_9fa48("319") ? focused : (stryCov_9fa48("319"), !focused)) || composing)) || (stryMutAct_9fa48("321") ? visible || !foreground || !covered && !idle : stryMutAct_9fa48("320") ? false : (stryCov_9fa48("320", "321"), visible && (stryMutAct_9fa48("323") ? !foreground && !covered && !idle : stryMutAct_9fa48("322") ? true : (stryCov_9fa48("322", "323"), (stryMutAct_9fa48("324") ? foreground : (stryCov_9fa48("324"), !foreground)) || (stryMutAct_9fa48("326") ? !covered || !idle : stryMutAct_9fa48("325") ? false : (stryCov_9fa48("325", "326"), (stryMutAct_9fa48("327") ? covered : (stryCov_9fa48("327"), !covered)) && (stryMutAct_9fa48("328") ? idle : (stryCov_9fa48("328"), !idle)))))))))) {
                if (stryMutAct_9fa48("329")) {
                  {}
                } else {
                  stryCov_9fa48("329");
                  if (stryMutAct_9fa48("330")) {
                    ;
                  } else {
                    stryCov_9fa48("330");
                    lift();
                  }
                  return;
                }
              }
              if (stryMutAct_9fa48("333") ? false : stryMutAct_9fa48("332") ? true : stryMutAct_9fa48("331") ? held : (stryCov_9fa48("331", "332", "333"), !held)) {
                if (stryMutAct_9fa48("334")) {
                  {}
                } else {
                  stryCov_9fa48("334");
                  if (stryMutAct_9fa48("336") ? false : stryMutAct_9fa48("335") ? true : (stryCov_9fa48("335", "336"), textBox(box) ? box.readOnly : stryMutAct_9fa48("337") ? box.isContentEditable : (stryCov_9fa48("337"), !box.isContentEditable))) return;
                  held = stryMutAct_9fa48("338") ? false : (stryCov_9fa48("338"), true);
                  if (stryMutAct_9fa48("340") ? false : stryMutAct_9fa48("339") ? true : (stryCov_9fa48("339", "340"), nativeCaret)) {
                    if (stryMutAct_9fa48("341")) {
                      {}
                    } else {
                      stryCov_9fa48("341");
                      animation = box.style.getPropertyValue(stryMutAct_9fa48("342") ? "" : (stryCov_9fa48("342"), "caret-animation"));
                      animationPriority = box.style.getPropertyPriority(stryMutAct_9fa48("343") ? "" : (stryCov_9fa48("343"), "caret-animation"));
                      box.style.setProperty(stryMutAct_9fa48("345") ? "" : (stryCov_9fa48("345"), "caret-animation"), stryMutAct_9fa48("346") ? "" : (stryCov_9fa48("346"), "manual"));
                    }
                  } else {
                    if (stryMutAct_9fa48("347")) {
                      {}
                    } else {
                      stryCov_9fa48("347");
                      if (stryMutAct_9fa48("349") ? false : stryMutAct_9fa48("348") ? true : (stryCov_9fa48("348", "349"), textBox(box))) box.readOnly = stryMutAct_9fa48("350") ? false : (stryCov_9fa48("350"), true);else {
                        if (stryMutAct_9fa48("351")) {
                          {}
                        } else {
                          stryCov_9fa48("351");
                          box.tabIndex = 0;
                          box.contentEditable = stryMutAct_9fa48("352") ? "" : (stryCov_9fa48("352"), "false");
                        }
                      }
                      if (stryMutAct_9fa48("353")) {
                        ;
                      } else {
                        stryCov_9fa48("353");
                        reconsider(box);
                      }
                    }
                  }
                  onHeld(stryMutAct_9fa48("355") ? false : (stryCov_9fa48("355"), true));
                  if (stryMutAct_9fa48("358") ? false : stryMutAct_9fa48("357") ? true : stryMutAct_9fa48("356") ? held : (stryCov_9fa48("356", "357", "358"), !held)) return;
                }
              }
              if (stryMutAct_9fa48("360") ? false : stryMutAct_9fa48("359") ? true : (stryCov_9fa48("359", "360"), nativeCaret)) return;
              if (stryMutAct_9fa48("363") ? visible || foreground : stryMutAct_9fa48("362") ? false : stryMutAct_9fa48("361") ? true : (stryCov_9fa48("361", "362", "363"), visible && foreground)) {
                if (stryMutAct_9fa48("364")) {
                  {}
                } else {
                  stryCov_9fa48("364");
                  if (stryMutAct_9fa48("367") ? false : stryMutAct_9fa48("366") ? true : stryMutAct_9fa48("365") ? caret : (stryCov_9fa48("365", "366", "367"), !caret)) {
                    if (stryMutAct_9fa48("368")) {
                      {}
                    } else {
                      stryCov_9fa48("368");
                      caret = doc.createElement(stryMutAct_9fa48("369") ? "" : (stryCov_9fa48("369"), "span"));
                      caret.setAttribute(stryMutAct_9fa48("371") ? "" : (stryCov_9fa48("371"), "aria-hidden"), stryMutAct_9fa48("372") ? "" : (stryCov_9fa48("372"), "true"));
                      caret.setAttribute(stryMutAct_9fa48("374") ? "" : (stryCov_9fa48("374"), "data-ouro-steady-caret"), stryMutAct_9fa48("375") ? "Stryker was here!" : (stryCov_9fa48("375"), ""));
                      caret.style.cssText = stryMutAct_9fa48("376") ? `` : (stryCov_9fa48("376"), `position:absolute;pointer-events:none;width:${macWebKit ? 2 : 1}px`);
                      if (stryMutAct_9fa48("377")) {
                        ;
                      } else {
                        stryCov_9fa48("377");
                        box.parentElement!.append(caret);
                      }
                    }
                  }
                  if (stryMutAct_9fa48("378")) {
                    ;
                  } else {
                    stryCov_9fa48("378");
                    draw();
                  }
                }
              } else {
                if (stryMutAct_9fa48("379")) {
                  {}
                } else {
                  stryCov_9fa48("379");
                  stryMutAct_9fa48("380") ? caret.remove() : (stryCov_9fa48("380"), caret?.remove());
                  caret = undefined;
                }
              }
            }
          };
          const wake = () => {
            if (stryMutAct_9fa48("381")) {
              {}
            } else {
              stryCov_9fa48("381");
              if (stryMutAct_9fa48("384") ? false : stryMutAct_9fa48("383") ? true : stryMutAct_9fa48("382") ? active : (stryCov_9fa48("382", "383", "384"), !active)) return;
              lastInput = Date.now();
              covered = stryMutAct_9fa48("385") ? true : (stryCov_9fa48("385"), false);
              const needsUpdate = stryMutAct_9fa48("388") ? held && timer === undefined : stryMutAct_9fa48("387") ? false : stryMutAct_9fa48("386") ? true : (stryCov_9fa48("386", "387", "388"), held || (stryMutAct_9fa48("390") ? timer !== undefined : stryMutAct_9fa48("389") ? false : (stryCov_9fa48("389", "390"), timer === undefined)));
              if (stryMutAct_9fa48("391")) {
                ;
              } else {
                stryCov_9fa48("391");
                lift();
              }
              if (stryMutAct_9fa48("393") ? false : stryMutAct_9fa48("392") ? true : (stryCov_9fa48("392", "393"), needsUpdate)) if (stryMutAct_9fa48("394")) {
                ;
              } else {
                stryCov_9fa48("394");
                update();
              }
            }
          };
          const input = (event: Event) => {
            if (stryMutAct_9fa48("395")) {
              {}
            } else {
              stryCov_9fa48("395");
              if (stryMutAct_9fa48("398") ? event.type !== "compositionstart" : stryMutAct_9fa48("397") ? false : stryMutAct_9fa48("396") ? true : (stryCov_9fa48("396", "397", "398"), event.type === (stryMutAct_9fa48("399") ? "" : (stryCov_9fa48("399"), "compositionstart")))) composing = stryMutAct_9fa48("400") ? false : (stryCov_9fa48("400"), true);
              if (stryMutAct_9fa48("403") ? event.type !== "compositionend" : stryMutAct_9fa48("402") ? false : stryMutAct_9fa48("401") ? true : (stryCov_9fa48("401", "402", "403"), event.type === (stryMutAct_9fa48("404") ? "" : (stryCov_9fa48("404"), "compositionend")))) composing = stryMutAct_9fa48("405") ? true : (stryCov_9fa48("405"), false);
              if (stryMutAct_9fa48("406")) {
                ;
              } else {
                stryCov_9fa48("406");
                wake();
              }
              if (stryMutAct_9fa48("409") ? event.type !== "compositionstart" : stryMutAct_9fa48("408") ? false : stryMutAct_9fa48("407") ? true : (stryCov_9fa48("407", "408", "409"), event.type === (stryMutAct_9fa48("410") ? "" : (stryCov_9fa48("410"), "compositionstart")))) if (stryMutAct_9fa48("411")) {
                ;
              } else {
                stryCov_9fa48("411");
                update();
              }
            }
          };
          const arrive = () => {
            if (stryMutAct_9fa48("412")) {
              {}
            } else {
              stryCov_9fa48("412");
              lastInput = Date.now();
              if (stryMutAct_9fa48("413")) {
                ;
              } else {
                stryCov_9fa48("413");
                update();
              }
            }
          };
          const observer = new ResizeObserver(draw);
          if (stryMutAct_9fa48("414")) {
            ;
          } else {
            stryCov_9fa48("414");
            observer.observe(box);
          }
          if (stryMutAct_9fa48("415")) {
            ;
          } else {
            stryCov_9fa48("415");
            observer.observe(box.parentElement!);
          }
          for (const type of wakeEvents) box.addEventListener(type, input, stryMutAct_9fa48("417") ? false : (stryCov_9fa48("417"), true));
          box.addEventListener(stryMutAct_9fa48("419") ? "" : (stryCov_9fa48("419"), "focus"), arrive);
          box.addEventListener(stryMutAct_9fa48("421") ? "" : (stryCov_9fa48("421"), "blur"), update);
          doc.addEventListener(stryMutAct_9fa48("423") ? "" : (stryCov_9fa48("423"), "visibilitychange"), arrive);
          doc.addEventListener(stryMutAct_9fa48("425") ? "" : (stryCov_9fa48("425"), "selectionchange"), draw);
          win.addEventListener(stryMutAct_9fa48("427") ? "" : (stryCov_9fa48("427"), "focus"), arrive);
          win.addEventListener(stryMutAct_9fa48("429") ? "" : (stryCov_9fa48("429"), "blur"), update);
          win.addEventListener(stryMutAct_9fa48("431") ? "" : (stryCov_9fa48("431"), "resize"), draw);
          win.addEventListener(stryMutAct_9fa48("433") ? "" : (stryCov_9fa48("433"), "scroll"), draw, stryMutAct_9fa48("434") ? false : (stryCov_9fa48("434"), true));
          current.current = stryMutAct_9fa48("435") ? {} : (stryCov_9fa48("435"), {
            cover: value => {
              if (stryMutAct_9fa48("436")) {
                {}
              } else {
                stryCov_9fa48("436");
                covered = value;
                if (stryMutAct_9fa48("437")) {
                  ;
                } else {
                  stryCov_9fa48("437");
                  arrive();
                }
              }
            },
            refresh: draw
          });
          const unsubscribe = subscribeWake(wake);
          if (stryMutAct_9fa48("440") ? !nativeCaret || doc.activeElement === box : stryMutAct_9fa48("439") ? false : stryMutAct_9fa48("438") ? true : (stryCov_9fa48("438", "439", "440"), (stryMutAct_9fa48("441") ? nativeCaret : (stryCov_9fa48("441"), !nativeCaret)) && (stryMutAct_9fa48("443") ? doc.activeElement !== box : stryMutAct_9fa48("442") ? true : (stryCov_9fa48("442", "443"), doc.activeElement === box)))) if (stryMutAct_9fa48("444")) {
            ;
          } else {
            stryCov_9fa48("444");
            reconsider(box);
          }
          if (stryMutAct_9fa48("445")) {
            ;
          } else {
            stryCov_9fa48("445");
            update();
          }
          return () => {
            if (stryMutAct_9fa48("446")) {
              {}
            } else {
              stryCov_9fa48("446");
              active = stryMutAct_9fa48("447") ? true : (stryCov_9fa48("447"), false);
              if (stryMutAct_9fa48("448")) {
                ;
              } else {
                stryCov_9fa48("448");
                clearTimer();
              }
              if (stryMutAct_9fa48("449")) {
                ;
              } else {
                stryCov_9fa48("449");
                unsubscribe();
              }
              current.current = null;
              for (const type of wakeEvents) box.removeEventListener(type, input, stryMutAct_9fa48("451") ? false : (stryCov_9fa48("451"), true));
              box.removeEventListener(stryMutAct_9fa48("453") ? "" : (stryCov_9fa48("453"), "focus"), arrive);
              box.removeEventListener(stryMutAct_9fa48("455") ? "" : (stryCov_9fa48("455"), "blur"), update);
              doc.removeEventListener(stryMutAct_9fa48("457") ? "" : (stryCov_9fa48("457"), "visibilitychange"), arrive);
              doc.removeEventListener(stryMutAct_9fa48("459") ? "" : (stryCov_9fa48("459"), "selectionchange"), draw);
              win.removeEventListener(stryMutAct_9fa48("461") ? "" : (stryCov_9fa48("461"), "focus"), arrive);
              win.removeEventListener(stryMutAct_9fa48("463") ? "" : (stryCov_9fa48("463"), "blur"), update);
              win.removeEventListener(stryMutAct_9fa48("465") ? "" : (stryCov_9fa48("465"), "resize"), draw);
              win.removeEventListener(stryMutAct_9fa48("467") ? "" : (stryCov_9fa48("467"), "scroll"), draw, stryMutAct_9fa48("468") ? false : (stryCov_9fa48("468"), true));
              if (stryMutAct_9fa48("469")) {
                ;
              } else {
                stryCov_9fa48("469");
                observer.disconnect();
              }
              if (stryMutAct_9fa48("470")) {
                ;
              } else {
                stryCov_9fa48("470");
                lift();
              }
              delete box.dataset.caretRest;
            }
          };
        }
      }, stryMutAct_9fa48("471") ? [] : (stryCov_9fa48("471"), [box, enabled, subscribeWake, onHeld, inputType]));
    }
    useLayoutEffect(stryMutAct_9fa48("473") ? () => undefined : (stryCov_9fa48("473"), () => stryMutAct_9fa48("474") ? current.current.cover(occluded === true) : (stryCov_9fa48("474"), current.current?.cover(stryMutAct_9fa48("477") ? occluded !== true : stryMutAct_9fa48("476") ? false : stryMutAct_9fa48("475") ? true : (stryCov_9fa48("475", "476", "477"), occluded === (stryMutAct_9fa48("478") ? false : (stryCov_9fa48("478"), true)))))), stryMutAct_9fa48("479") ? [] : (stryCov_9fa48("479"), [box, enabled, occluded]));
    useLayoutEffect(stryMutAct_9fa48("481") ? () => undefined : (stryCov_9fa48("481"), () => stryMutAct_9fa48("482") ? current.current.refresh() : (stryCov_9fa48("482"), current.current?.refresh())));
  }
}