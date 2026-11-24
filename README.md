# EPUB → Vocabulary Library

A self-contained agent skill for turning a vocabulary EPUB into a JSON book importable at [HongRZ Vocab](https://hongrz.me/vocab/).

Copy this prompt to your own agent and attach your EPUB:

> 请使用这个 skill，将我的 EPUB 转换为可导入 Vocabulary Library 的 JSON：https://raw.githubusercontent.com/HongRZ123/vocab-epub-to-json/main/SKILL.md

Then import the result through the website's “导入词书” button. Books are stored in your current browser; keep your JSON as backup. The repository contains tooling and an original example, not users' ebooks.

The extractor is layout-neutral; your agent must interpret each book's actual structure. This is not a universal one-click EPUB parser. Python 3.10+ and Node.js 18+ are required for the supplied tools.

```sh
python scripts/extract_epub.py input.epub source.json
node scripts/validate_book.mjs output.json
python -m unittest discover -s tests
```
