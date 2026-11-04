#!/bin/sh
# Builds Ouro Feel's WKWebView host with the Swift compiler Xcode or the Command Line Tools give.
#   sh feel/hosts/wkwebview/build.sh [<output>]   (default .tmp/feel/ouro-feel-wkwebview)
set -eu
here=$(cd "$(dirname "$0")" && pwd)
out=${1:-"$here/../../../.tmp/feel/ouro-feel-wkwebview"}
mkdir -p "$(dirname "$out")"
xcrun swiftc -O -swift-version 5 -framework AppKit -framework WebKit -o "$out" "$here/main.swift"
echo "Built $out"
