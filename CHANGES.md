# Changes in this release

- Fixed: Ouro check's linked-card-dead-zone no longer judges the box around a link the page positions, whose ::after only widens its tap target, as a card that is one link (ourostack/ouroboros-website's `.hit` links were found on its blog, approach and model reviews pages) ([test](test/check-reach-in-page.test.tsx "verify:fileLine(test/check-reach-in-page.test.tsx, /judges no box around a link the page positions/)")).
