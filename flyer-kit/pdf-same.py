#!/usr/bin/env python3
"""Compare two PDFs ignoring Chromium's per-run metadata.

Chromium stamps /CreationDate, /ModDate, and the trailer /ID into every
--print-to-pdf output, so two renders of identical content differ in exactly
those bytes (all fixed-length, so object offsets are unaffected). Exit 0 when
the files are equal after stripping them — "no real change".

Usage: pdf-same.py <a.pdf> <b.pdf>
"""
import re
import sys


def normalized(path):
    with open(path, 'rb') as f:
        data = f.read()
    data = re.sub(rb'/(CreationDate|ModDate)\s*\(D:[^)]*\)', b'', data)
    data = re.sub(rb'/ID\s*\[\s*<[0-9A-Fa-f]+>\s*<[0-9A-Fa-f]+>\s*\]', b'', data)
    return data


if len(sys.argv) != 3:
    print('usage: pdf-same.py <a.pdf> <b.pdf>', file=sys.stderr)
    sys.exit(2)
sys.exit(0 if normalized(sys.argv[1]) == normalized(sys.argv[2]) else 1)
