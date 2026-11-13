export { loadFonts };

// The export list comes first because the shadcn CLI drops comments before a file's
// first statement, which would take the JSDoc below with it.

/**
 * Loads every font face the page's stylesheets declare and waits for each to settle. A face that
 * loads mid-test moves text between two layout reads; a face that fails to load settles without
 * rejecting, so a missing font never fails a file's setup.
 */
async function loadFonts(): Promise<void> {
  await Promise.allSettled([...document.fonts].map((face) => face.load()));
  await document.fonts.ready;
}
