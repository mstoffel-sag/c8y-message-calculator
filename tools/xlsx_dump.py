#!/usr/bin/env python3
"""Dump an .xlsx to readable text: every sheet, every cell, formulas AND cached values.

Stdlib only (an .xlsx is a zip of XML). Usage:
    python3 tools/xlsx_dump.py <file.xlsx> [--sheet NAME] [--max-rows N]
"""
import sys, re, zipfile, argparse
import xml.etree.ElementTree as ET

NS = {
    'm': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'p': 'http://schemas.openxmlformats.org/package/2006/relationships',
}


def text_of(si):
    """Concatenate all <t> runs inside a sharedStrings <si>."""
    return ''.join(t.text or '' for t in si.iter('{%s}t' % NS['m']))


def load_shared_strings(z):
    if 'xl/sharedStrings.xml' not in z.namelist():
        return []
    root = ET.fromstring(z.read('xl/sharedStrings.xml'))
    return [text_of(si) for si in root.findall('m:si', NS)]


def load_sheets(z):
    """Return [(name, zip_path)] in workbook order."""
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    target = {}
    for rel in rels.findall('p:Relationship', NS):
        t = rel.get('Target').lstrip('/')
        target[rel.get('Id')] = t if t.startswith('xl/') else 'xl/' + t
    out = []
    for sh in wb.findall('m:sheets/m:sheet', NS):
        rid = sh.get('{%s}id' % NS['r'])
        out.append((sh.get('name'), target.get(rid)))
    return out, wb


def defined_names(wb):
    out = []
    for dn in wb.findall('m:definedNames/m:definedName', NS):
        out.append((dn.get('name'), (dn.text or '').strip()))
    return out


def col_of(ref):
    return re.match(r'([A-Z]+)', ref or '').group(1) if ref else ''


def dump_sheet(z, path, strings, max_rows):
    root = ET.fromstring(z.read(path))
    rows = root.findall('m:sheetData/m:row', NS)
    printed = 0
    for row in rows:
        if max_rows and printed >= max_rows:
            print('    ... truncated at %d rows' % max_rows)
            break
        cells = []
        for c in row.findall('m:c', NS):
            ref, ctype = c.get('r'), c.get('t')
            f = c.find('m:f', NS)
            v = c.find('m:v', NS)
            isel = c.find('m:is', NS)

            if ctype == 's' and v is not None and v.text is not None:
                val = strings[int(v.text)]
            elif ctype == 'inlineStr' and isel is not None:
                val = text_of(isel)
            elif v is not None:
                val = v.text
            else:
                val = None

            if f is None and val is None:
                continue
            if f is not None:
                shared = ' [shared:%s]' % f.get('si') if f.get('t') == 'shared' else ''
                formula = ('=' + f.text) if f.text else ('=<shared %s>' % f.get('si'))
                cells.append('%s: %s%s  -> %s' % (ref, formula, shared, val))
            else:
                cells.append('%s: %s' % (ref, val))
        if cells:
            printed += 1
            print('  ' + ' | '.join(cells))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('path')
    ap.add_argument('--sheet', action='append', help='only these sheet names')
    ap.add_argument('--max-rows', type=int, default=0, help='0 = all')
    a = ap.parse_args()

    with zipfile.ZipFile(a.path) as z:
        strings = load_shared_strings(z)
        sheets, wb = load_sheets(z)

        print('WORKBOOK: %s' % a.path)
        print('SHEETS:   %s' % ', '.join(n for n, _ in sheets))
        dn = defined_names(wb)
        if dn:
            print('NAMED RANGES:')
            for n, t in dn:
                print('  %s = %s' % (n, t))

        for name, path in sheets:
            if a.sheet and name not in a.sheet:
                continue
            if not path or path not in z.namelist():
                print('\n=== %s === (missing: %s)' % (name, path))
                continue
            print('\n=== SHEET: %s ===' % name)
            dump_sheet(z, path, strings, a.max_rows)


if __name__ == '__main__':
    main()
