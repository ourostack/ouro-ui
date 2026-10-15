import * as React from "react"

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange)
  return () => window.removeEventListener("hashchange", onChange)
}

function getHash() {
  return window.location.hash
}

/** The current URL hash, kept in sync with navigation. */
export function useHash() {
  return React.useSyncExternalStore(subscribe, getHash, getHash)
}
