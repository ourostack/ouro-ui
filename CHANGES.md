# Changes in this release

- Fixed: [Ouro check's `near-miss` rule passes the parts of one control group and a small surface centred in a control's frame](test/check-layout-in-page.test.ts "verify:testExists(test/check-layout-in-page.test.ts::findLayoutIssues: near-miss > passes the parts of one control group, and finds two groups, or a group and a surface outside it, that nearly touch)"), such as ToggleGroup items and a Kbd in its field; separate groups that nearly touch still fail.
