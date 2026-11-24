# EPUB → Vocabulary Library

A self-contained agent skill for turning a vocabulary EPUB into a JSON book importable at [HongRZ Vocab](https://hongrz.me/vocab/).

Copy this prompt to your own agent and attach your EPUB:

> 请读取 https://raw.githubusercontent.com/HongRZ123/vocab-epub-to-json/main/SKILL.md 及它引用的文件，按照该 skill 将我提供的 EPUB 完整转换为 hongrz.me/vocab 支持的标准 JSON。保留原书目录、释义、例句与练习；答案不确定时明确标记，不要编造。运行校验并检查覆盖范围，最后给我可下载的 JSON 和简短转换说明。请在本地处理，不要公开上传我的书籍。

Then import the result through the website's “导入词书” button. Books are stored in your current browser; keep your JSON as backup. The repository contains tooling and an original example, not users' ebooks.

The extractor is layout-neutral; your agent must interpret each book's actual structure. This is not a universal one-click EPUB parser. Python 3.10+ and Node.js 18+ are required for the supplied tools.

```sh
python scripts/extract_epub.py input.epub source.json
node scripts/validate_book.mjs output.json
python -m unittest discover -s tests
```
