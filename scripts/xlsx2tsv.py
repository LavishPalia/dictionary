# Minimal stdlib .xlsx -> TSV converter (first sheet) used by scripts/fetch-sources.sh.
import sys, zipfile, re
import xml.etree.ElementTree as ET
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
src, dst = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(src)
ss = []
if 'xl/sharedStrings.xml' in z.namelist():
    for si in ET.fromstring(z.read('xl/sharedStrings.xml')).iter(NS + 'si'):
        ss.append(''.join(t.text or '' for t in si.iter(NS + 't')))
def colidx(ref):
    m = re.match(r'([A-Z]+)', ref); n = 0
    for ch in m.group(1): n = n * 26 + ord(ch) - 64
    return n - 1
out = open(dst, 'w', encoding='utf-8', newline='\n')
for ev, el in ET.iterparse(z.open('xl/worksheets/sheet1.xml')):
    if el.tag == NS + 'row':
        cells = {}
        for c in el.iter(NS + 'c'):
            v = c.find(NS + 'v'); t = c.get('t')
            if v is None:
                is_ = c.find(NS + 'is')
                val = ''.join(x.text or '' for x in is_.iter(NS + 't')) if is_ is not None else ''
            elif t == 's': val = ss[int(v.text)]
            else: val = v.text or ''
            cells[colidx(c.get('r'))] = val.replace('\t', ' ').replace('\n', ' ')
        if cells:
            out.write('\t'.join(cells.get(i, '') for i in range(max(cells) + 1)) + '\n')
        el.clear()
out.close()
