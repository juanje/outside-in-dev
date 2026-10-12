#!/bin/sh
# Installs a packed oid release with the exact dependency tree it was tested with (ADR-052).
# A global install straight from the tarball resolves the dependencies again and ignores the
# shrinkwrap inside it, so the tarball is unpacked into its own directory, installed there with
# `npm ci` (which follows the shrinkwrap), and that directory is installed globally.
#
# Usage: scripts/install-release.sh ./outside-in-dev-<version>.tgz
# The release directories stay under $OID_RELEASES (default ~/.local/lib/oid): keep the previous
# one to roll back with `npm install -g <its directory>`.
set -eu

if [ "$#" -ne 1 ] || [ ! -f "$1" ]; then
  echo "usage: $0 <outside-in-dev-<version>.tgz>" >&2
  exit 1
fi

tarball=$(realpath "$1")
dir="${OID_RELEASES:-$HOME/.local/lib/oid}/$(basename "$tarball" .tgz)"

rm -rf "$dir"
mkdir -p "$dir"
tar xzf "$tarball" -C "$dir" --strip-components=1
(cd "$dir" && npm ci --omit=dev --no-audit --no-fund)
npm install -g "$dir"
oid --version
