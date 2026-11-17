# Changes in this release

- New: Ouro check's off-theme and off-scale rules find a style an app wrote past its theme (a fixed colour, radius, shadow or font, or a fixed padding, margin or gap) and name the token to use.
- Fixed: Ouro Current gives a vendored Ouro AX folder its own package.json, mapping `#ouro-ax/*`, when the repository has nothing above that folder to map it, and turns an update pull request's auto-merge off around a push so a merge queue cannot take it before its checks start.
