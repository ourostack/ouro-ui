# Changes in this release

- New: the Ouro AX X-ray accepts a command's stdout as its one JSON reply line when help JSON marks the command `protocol: true` (a stdin/stdout protocol, such as ourostack/hackamore's `wire`). The stderr one-line error and the exit code are still checked, and undeclared commands keep the full claim.
- New: `ax-surfaces` can leave a folder or file out of what it extracts (`exclude`, and `surfaces extract --exclude <path,path>`), so a repository that vendors the kit under its own folder holds its own words to the checks and not the kit's.
