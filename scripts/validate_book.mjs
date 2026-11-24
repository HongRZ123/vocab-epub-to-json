import { readFile } from 'node:fs/promises';
import { indexBook, imageSource } from '../references/format-model.mjs';

export function validate(book) {
  const ctx = indexBook(book);
  if (!ctx.pages.length) throw Error('Book has no readable pages');
  for (const [name, value] of Object.entries(book.assets ?? {})) {
    if (!imageSource({}, value)) throw Error('Asset must be an embedded raster image: ' + name);
  }
  if (book.cover && !imageSource(book, book.cover)) throw Error('Invalid or nonportable cover');
  for (const [name, target] of Object.entries(book.links ?? {})) {
    if (!target || !ctx.nodes.has(target.node)) throw Error('Broken internal link: ' + name);
  }
  const scan = value => {
    if (Array.isArray(value)) return value.forEach(scan);
    if (!value || typeof value !== 'object') return;
    if (typeof value.html === 'string') {
      if (/<\s*(script|style|iframe|object|embed|svg|math)\b|\son\w+\s*=|\sstyle\s*=/i.test(value.html)) throw Error('Executable or unsupported HTML');
      for (const match of value.html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
        if (!imageSource(book, match[1])) throw Error('Image must use an embedded asset: ' + match[1]);
      }
    }
    Object.values(value).forEach(scan);
  };
  scan(book.contents);
  return { valid: true, nodes: ctx.nodes.size, groups: ctx.groups.length, cards: ctx.cardCount,
    exercises: ctx.exercises.length, unknownAnswers: ctx.exercises.filter(q => q.answer == null).length,
    note: 'Structure validated; source completeness and answer alignment require separate review.' };
}

if (process.argv[1]?.endsWith('validate_book.mjs')) {
  try {
    if (!process.argv[2]) throw Error('Usage: node scripts/validate_book.mjs book.json');
    console.log(JSON.stringify(validate(JSON.parse(await readFile(process.argv[2], 'utf8'))), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
