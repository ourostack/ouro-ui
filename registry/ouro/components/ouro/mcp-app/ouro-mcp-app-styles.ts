export { ROOT_CLASS, DEFAULT_APP_INFO, METHOD_NOT_FOUND, INVALID_PARAMS };

/** The view's column: the card, then what the last press did, with HX's medium gap between them. */
const ROOT_CLASS = "grid min-w-0 gap-4";

/** What the view tells the host it is, in `ui/initialize`, when the app names nothing else. */
const DEFAULT_APP_INFO = { name: "Ouro HX card", version: "1.0.0" };

/** JSON-RPC's code for a method the receiver doesn't have. */
const METHOD_NOT_FOUND = -32601;

/** JSON-RPC's code for a request whose parameters the receiver refuses: here, a function call the catalog doesn't declare. */
const INVALID_PARAMS = -32602;
