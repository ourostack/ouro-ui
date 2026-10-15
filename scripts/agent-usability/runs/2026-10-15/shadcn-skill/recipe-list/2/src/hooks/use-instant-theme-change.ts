import * as React from "react"

/**
 * Switches colors at once when the `dark` class on <html> changes, instead of letting
 * transitions fade them through low-contrast in-between colors.
 */
export function useInstantThemeChange() {
  React.useEffect(() => {
    const root = document.documentElement
    let dark = root.classList.contains("dark")
    let frame = 0
    const style = document.createElement("style")
    style.textContent = "*,*::before,*::after{transition:none!important}"

    const observer = new MutationObserver(() => {
      const next = root.classList.contains("dark")
      if (next === dark) return
      dark = next

      document.head.appendChild(style)
      // Apply the new colors while transitions are off.
      void window.getComputedStyle(document.body).color
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => style.remove())
      })
    })
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      style.remove()
    }
  }, [])
}
