import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from extract_epub import extract, resolve


class ConversionTest(unittest.TestCase):
    def test_spine_order_and_nested_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'source.epub'
            with zipfile.ZipFile(source, 'w') as z:
                z.writestr('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>')
                z.writestr('OPS/package.opf', '<package><metadata><title>Original fixture</title></metadata><manifest><item id="z" href="text/z.xhtml"/><item id="a" href="text/a.xhtml"/><item id="img" href="images/p.png" media-type="image/png"/></manifest><spine><itemref idref="z"/><itemref idref="a"/></spine></package>')
                z.writestr('OPS/text/z.xhtml', '<html><body><h1>First</h1><p>hello</p><script>ignored()</script></body></html>')
                z.writestr('OPS/text/a.xhtml', '<html><body><p>Last</p></body></html>')
                z.writestr('OPS/images/p.png', b'fixture')
            result = extract(source)
            self.assertEqual([x['source'] for x in result['chapters']], ['OPS/text/z.xhtml', 'OPS/text/a.xhtml'])
            self.assertNotIn('ignored', result['chapters'][0]['text'])
            self.assertTrue(result['assets']['OPS/images/p.png'].startswith('data:image/png;base64,'))

    def test_reject_unsafe_paths(self):
        for href in ['../../evil', '/evil', 'https://example.com/x', '..%2F..%2Fevil', 'a\\b']:
            with self.assertRaises(ValueError): resolve('OPS', href)

    def test_app_validator_and_references(self):
        book = json.loads((ROOT/'assets/example-book.json').read_text())
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)/'book.json'
            def run(data):
                target.write_text(json.dumps(data), encoding='utf-8')
                return subprocess.run(['node', str(ROOT/'scripts/validate_book.mjs'), str(target)], capture_output=True).returncode
            self.assertEqual(run(book), 0)
            book['contents'][0]['children'][1]['groupIds'] = ['missing']
            self.assertNotEqual(run(book), 0)
            book['contents'][0]['children'][1]['groupIds'] = ['group-1']
            book['contents'][0]['children'][1]['exercises'][0]['answer'] = 'missing'
            self.assertNotEqual(run(book), 0)
            book['contents'][0]['children'][1]['exercises'][0]['answer'] = None
            self.assertEqual(run(book), 0)


if __name__ == '__main__': unittest.main()
