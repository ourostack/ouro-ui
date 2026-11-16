# Changes in this release

- Fixed: Ouro check no longer stops on a page whose body is drawn with a [gradient](test/check-design-in-page.test.ts "verify:testExists(test/check-design-in-page.test.ts::findDesignIssues: cramped-heading > judges no fill against a page drawn with a gradient, rather than failing the whole check)"), as the [factory site](https://github.com/ourostack/factory) is; a box's fill is judged only against a page of one colour.
- Fixed: Ouro Current changes only the followed source's values in `upstream-sources.lock.json` and keeps the rest of the file as the repository wrote it.
- New: a repository can declare in `.github/ouro-current.json` what it asks of a change, a version past its latest release or a changelog fragment, and Ouro Current's update does it.
