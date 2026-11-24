"""Extract EPUB reading-order evidence without executing or unpacking book content."""
import argparse
import base64
import json
import posixpath
import re
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree as ET

LIMIT = 128 * 1024 * 1024


def resolve(base, href):
    parsed = urlsplit(href)
    if parsed.scheme or parsed.netloc:
        raise ValueError('External EPUB resource is unsupported')
    path = posixpath.normpath(posixpath.join(base, unquote(parsed.path)))
    if path.startswith(('/', '../')) or path == '..' or '\\' in path:
        raise ValueError('Unsafe EPUB resource path')
    return path


def xml(data):
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('DTD/entity declarations are unsupported')
    return ET.fromstring(data)


class Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.hidden += 1
        if tag in ('p', 'div', 'br', 'li', 'h1', 'h2', 'h3', 'tr'): self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self.hidden: self.hidden -= 1
        if tag in ('p', 'div', 'li', 'tr'): self.parts.append('\n')

    def handle_data(self, text):
        if not self.hidden: self.parts.append(text)


def extract(source):
    with zipfile.ZipFile(source) as archive:
        infos = archive.infolist()
        if len(infos) > 10000 or sum(i.file_size for i in infos) > LIMIT:
            raise ValueError('EPUB exceeds 128 MiB / 10000 resource limit')
        names = [i.filename for i in infos]
        if len(names) != len(set(names)): raise ValueError('Duplicate ZIP paths')
        for i in infos:
            resolve('', i.filename)
            if i.flag_bits & 1: raise ValueError('Encrypted ZIP member')
        container = xml(archive.read('META-INF/container.xml'))
        rootfile = next((x for x in container.iter() if x.tag.split('}')[-1] == 'rootfile'), None)
        if rootfile is None: raise ValueError('Missing EPUB package')
        package_path = resolve('', rootfile.attrib['full-path'])
        package = xml(archive.read(package_path))
        base = posixpath.dirname(package_path)
        manifest = {x.attrib['id']: x.attrib for x in package.iter() if x.tag.split('}')[-1] == 'item'}
        encrypted = set()
        if 'META-INF/encryption.xml' in names:
            for x in xml(archive.read('META-INF/encryption.xml')).iter():
                if x.tag.split('}')[-1] == 'CipherReference': encrypted.add(resolve('', x.attrib['URI']))
        chapters, assets, notes = [], {}, []
        for item in manifest.values():
            media = item.get('media-type', '')
            path = resolve(base, item['href'])
            if path in encrypted:
                notes.append('Encrypted resource omitted: ' + path)
                continue
            if media in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'):
                assets[path] = 'data:' + media + ';base64,' + base64.b64encode(archive.read(path)).decode()
        for ref in (x for x in package.iter() if x.tag.split('}')[-1] == 'itemref'):
            item = manifest[ref.attrib['idref']]
            path = resolve(base, item['href'])
            if path in encrypted: raise ValueError('Reading content is encrypted: ' + path)
            data = archive.read(path)
            encoding = re.search(br'encoding=[\"\x27]([^\"\x27]+)', data[:200])
            html = data.decode(encoding.group(1).decode() if encoding else 'utf-8-sig')
            parser = Text(); parser.feed(html)
            text = re.sub(r'\n\s*\n+', '\n\n', ''.join(parser.parts)).strip()
            if not text: notes.append('No readable text; inspect images/OCR need: ' + path)
            chapters.append({'source': path, 'linear': ref.get('linear', 'yes'), 'xhtml': html, 'text': text})
        if not chapters: raise ValueError('Empty EPUB spine')
        metadata = {}
        for x in package.iter():
            tag = x.tag.split('}')[-1]
            if tag in ('title', 'creator', 'language', 'identifier'): metadata.setdefault(tag, []).append(''.join(x.itertext()))
        return {'metadata': metadata, 'chapters': chapters, 'assets': assets, 'notes': notes}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('epub', type=Path); parser.add_argument('output', type=Path)
    args = parser.parse_args()
    if args.output.exists(): parser.error('Output exists; choose another path to preserve existing work')
    result = extract(args.epub)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'chapters': len(result['chapters']), 'images': len(result['assets']), 'notes': result['notes']}, ensure_ascii=False))
