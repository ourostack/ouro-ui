#!/bin/bash
# Runs one command (a single test file) when memory_pressure reports at least 30% free and one of two test slots is free, then holds the machine-wide browser lock (lane.sh browser) so one browser suite runs at a time.
# Swap is not the measure: macOS holds it long after pressure ends.
# Usage: bash scripts/local-test-gate.sh <command> [args...] (contributing/testing.md)
while :; do
  free=$(memory_pressure 2>/dev/null | sed -nE 's/.*free percentage: ([0-9]+)%.*/\1/p')
  if [ -n "$free" ] && [ "$free" -ge 30 ]; then
    for s in 1 2; do
      if mkdir /tmp/ouro-test-slot-$s 2>/dev/null; then
        trap 'rmdir /tmp/ouro-test-slot-'$s' 2>/dev/null' EXIT INT TERM
        bash "$(dirname "$0")/lane.sh" browser "$@"
        exit $?
      fi
    done
  fi
  echo "ouro-test-gate: waiting (memory free ${free:-?}%, or both slots busy)" >&2
  sleep 60
done
