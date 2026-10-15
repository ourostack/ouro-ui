import * as React from "react"

// Switches light and dark mode in one step. Without this, components with
// `transition-all` fade between the two palettes and show in-between colors
// for a moment after the `dark` class changes on <html>.
export function useInstantThemeSwitch() {
  React.useEffect(() => {
    const root = document.documentElement
    let dark = root.classList.contains("dark")

    const observer = new MutationObserver(() => {
      if (root.classList.contains("dark") === dark) return
      dark = !dark
      const style = document.createElement("style")
      style.textContent = "*,*::before,*::after{transition:none!important}"
      document.head.appendChild(style)
      // Apply the new colors with transitions off, then turn them back on.
      void window.getComputedStyle(document.body).color
      setTimeout(() => style.remove(), 1)
    })
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])
}
