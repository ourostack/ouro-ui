import stockCss from "../test/shadcn-stock.css?raw";

const style = document.createElement("style");
style.textContent = stockCss.replace(/^@import[^\n]*\n/gm, "");
document.head.append(style);
