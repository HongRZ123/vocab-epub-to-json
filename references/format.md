# Vocabulary Library JSON v1

The included `format-model.mjs` is a snapshot of the app's actual model as of 2026-11-24. `scripts/validate_book.mjs` calls its `indexBook` validator and adds portability checks.

## Book and directory

Root: `schemaVersion: 1`, `id`, nonempty `title`, `contents: []`. Optional string fields: `author`, `edition`, `description`, `cover`. `importNotes` is an array of strings. `assets` maps names to embedded raster-image data URLs. `links` maps original href strings to `{node: "node-id", anchor: "optional-element-id"}`.

IDs match `[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}`. Node, card and exercise IDs must be unique throughout a book. Use a distinctive versioned book ID to avoid collisions with existing imports.

Each contents node has `id`, `kind`, `title`; optional `children`, `intro`, `content`, `exercises`. Kinds:

- `section`: a chapter/container with children.
- `group`: a learning group, with required `cards` array.
- `quiz`: exercise page, optionally `groupIds` referencing the learning groups it tests.
- `content`: readable reference/introduction/answer-key page.

Arrays retain input order unless `order` is provided. If using `order`, assign it consistently to all siblings; unspecified values sort as zero.

Each card has `id`, `front`, `back`. Front is the word/phrase; back is its original definition, pronunciation, part of speech and examples. Put group explanations in `intro` rather than duplicating them on every card.

## Rich text and images

Rich text is a plain string, or a nonempty array of `{text: "..."}` or `{html: "..."}` blocks. Use text whenever markup is unnecessary. Supported HTML includes paragraphs, headings, emphasis, lists, blockquotes, simple tables, code, internal anchors and images. Scripts, styles, embedded frames and SVG are not supported. Do not use remote images, event handlers, inline styles or external links. A plain source reference may be preserved as text.

Embedded images: `assets: {"cover": "data:image/png;base64,..."}`, `cover: "cover"`, rich HTML `<img src="cover" alt="Description">`. JPEG, PNG, WebP, GIF and AVIF are supported. Standalone imported books cannot use the relative image URLs used by built-in books. Preserve readable image resolution; avoid encoding unneeded decorative assets.

Internal links: `links: {"chapter.xhtml#word": {"node":"group-1", "anchor":"entry-1"}}`. Use the same href in the HTML. Alternatively `href="#anchor-id"` targets an ID within the current page.

## Original exercises

Every exercise has `id`, `type`, `prompt`, `answer`; optional rich `explanation`, `groupIds`. `nodeId`, if present, must equal the enclosing node. Group references must exist. All types except `fill` require nonempty `options: [{id:"a",label:"..."}, ...]` with unique option IDs.

| type | answer | Use |
| --- | --- | --- |
| single | one option ID | choose one |
| multiple | array of option IDs | choose all correct |
| fill | string or array of accepted strings | typed answer; case/whitespace normalized |
| bank-fill | one option ID | select from a word bank |
| matching | one option ID | one matching prompt per question |
| paired | ordered array of option IDs | one selected option per role; `roles:["First","Second"]` (default two roles) |

For any type, `answer: null` means unknown and is excluded from grading. Never use an empty answer to mean unknown. Split a multi-row matching exercise into independently answered prompts unless the original structure is truly paired. Keep original numbering in the prompt/title and deterministic unique IDs.

## Acceptance

Validate all IDs, references, options, answer mappings, image aliases and node structure. Compare the source's complete spine against the output with explicit exclusions (e.g. copyright page). Check counts and representative entries manually. A generic ZIP extractor cannot determine vocabulary boundaries across all EPUB layouts; the agent must adapt the semantic conversion to the actual book.
