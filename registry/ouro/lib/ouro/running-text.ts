"use client";

import { createContext } from "react";

/**
 * Whether the content sits in running text: `Text` sets it, and `Link` reads it to keep its
 * touch area to its own line, where a taller one would cover the lines above and below.
 *
 * Internal: Ouro UI components use it; apps pass `inline` to `Link` instead.
 */
export const RunningTextContext = createContext(false);
