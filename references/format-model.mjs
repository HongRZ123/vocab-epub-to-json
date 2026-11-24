const kinds = new Set(['section', 'group', 'quiz', 'content']);
const types = new Set(['single', 'multiple', 'fill', 'bank-fill', 'matching', 'paired']);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const allowedImages = /^data:image\/(?:jpeg|png|webp|gif|avif);base64,[a-z0-9+/=]+$/i;
const relativeImagePath = /^(?:[A-Za-z0-9_-]+\/)+[A-Za-z0-9_-]+\.(?:jpe?g|png|webp|gif|avif)$/i;

export function imageSource(book, source, builtInBookUrl) {
  const value = Object.hasOwn(book.assets ?? {}, source) ? book.assets[source] : source;
  if (typeof value !== 'string') return '';
  if (allowedImages.test(value)) return value;
  return builtInBookUrl && relativeImagePath.test(value) ? new URL(value, builtInBookUrl).href : '';
}

export function ordered(items) {
  return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function indexBook(book) {
  const nodes = new Map();
  const groups = [];
  const pages = [];
  const exercises = [];
  const seen = new Set();
  const require = (ok, message) => { if (!ok) throw new Error(message); };
  const id = (value, item) => {
    require(typeof value === 'string' && idPattern.test(value) && !seen.has(value), 'ID 无效或重复 · ' + item);
    seen.add(value);
  };
  const richOk = value => typeof value === 'string' || (Array.isArray(value) &&
    value.length > 0 && value.every(block => block && (typeof block.text === 'string' || typeof block.html === 'string')));
  const list = (value, item) => require(Array.isArray(value), item + ' 应为数组');
  const orderedList = (value, item) => {
    list(value, item);
    require(value.every(x => x && (x.order === undefined || Number.isFinite(x.order))), item + ' 含无效排序');
    return ordered(value);
  };

  require(book?.schemaVersion === 1 && typeof book.title === 'string' && book.title.trim(), '需要书名及 schemaVersion 1');
  require(typeof book.id === 'string' && idPattern.test(book.id), '书籍 ID 无效');
  for (const field of ['author', 'edition', 'description', 'cover']) {
    require(book[field] == null || typeof book[field] === 'string', '书籍字段无效 · ' + field);
  }
  require(book.importNotes == null || (Array.isArray(book.importNotes) && book.importNotes.every(n => typeof n === 'string')), '待核对说明应为文本数组');
  const walk = (contents, parents = []) => {
    for (const node of orderedList(contents, '目录')) {
      require(kinds.has(node.kind) && typeof node.title === 'string' && node.title.trim(), '目录节点缺少类型或标题');
      id(node.id, node.title);
      for (const field of ['intro', 'content']) {
        require(node[field] == null || (Array.isArray(node[field]) && !node[field].length) || richOk(node[field]), '正文格式无效 · ' + node.id);
      }
      nodes.set(node.id, { node, parents });
      if (node.kind === 'group') {
        groups.push(node);
        for (const card of orderedList(node.cards, '单词卡片')) {
          id(card.id, node.title);
          require(richOk(card.front) && richOk(card.back), '卡片需要有效的正面和背面 · ' + card.id);
        }
      }
      if (node.kind === 'quiz') {
        require(node.groupIds == null || Array.isArray(node.groupIds), '测验组应为数组 · ' + node.id);
      }
      if (node.exercises !== undefined) {
        for (const exercise of orderedList(node.exercises, '习题')) {
          id(exercise.id, node.title);
          require(types.has(exercise.type) && richOk(exercise.prompt), '题型或题干无效 · ' + exercise.id);
          require(exercise.type !== 'paired' || exercise.roles == null || (Array.isArray(exercise.roles) &&
            exercise.roles.length > 0 && exercise.roles.every(role => typeof role === 'string' && role.trim())), '配对题输入栏无效 · ' + exercise.id);
          require(exercise.explanation == null || richOk(exercise.explanation), '习题解释格式无效 · ' + exercise.id);
          require(exercise.nodeId == null || exercise.nodeId === node.id, '题目位置不一致 · ' + exercise.id);
          require(exercise.groupIds == null || Array.isArray(exercise.groupIds), '习题组应为数组 · ' + exercise.id);
          if (exercise.type !== 'fill') {
            list(exercise.options, '选项');
            const dex = new Set(exercise.options.map(o => o?.id));
            require(exercise.options.length > 0 && dex.size === exercise.options.length &&
              exercise.options.every(o => typeof o?.id === 'string' && o.id && richOk(o.label)), '选项无效 · ' + exercise.id);
            if (exercise.answer != null) {
              if (['paired', 'multiple'].includes(exercise.type)) {
                require(Array.isArray(exercise.answer) && exercise.answer.length > 0 &&
                  exercise.answer.every(a => dex.has(a)), '答案不在选项内 · ' + exercise.id);
                if (exercise.type === 'paired') {
                  require(exercise.answer.length === (exercise.roles?.length ?? 2), '答案数量与输入栏不一致 · ' + exercise.id);
                }
              } else {
                require(dex.has(exercise.answer), '答案不在选项内 · ' + exercise.id);
              }
            }
          } else if (exercise.answer != null) {
            const answers = Array.isArray(exercise.answer) ? exercise.answer : [exercise.answer];
            require(answers.length && answers.every(a => typeof a === 'string' && a.trim()), '填空参考答案无效 · ' + exercise.id);
          }
          exercises.push({ ...exercise, nodeId: node.id,
            groupIds: exercise.groupIds ?? node.groupIds ?? (node.kind === 'group' ? [node.id] : []) });
        }
      }
      if (node.kind !== 'section' || node.content?.length || node.exercises?.length) pages.push(node);
      if (node.children !== undefined) walk(node.children, [...parents, node]);
    }
  };
  walk(book.contents);
  const groupIds = new Set(groups.map(g => g.id));
  for (const q of exercises) require(q.groupIds.every(id => groupIds.has(id)), '习题引用了未知学习组 · ' + q.id);
  return { book, nodes, groups, pages, exercises, cardCount: groups.reduce((n, g) => n + g.cards.length, 0) };
}

export function shuffle(values, random = Math.random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function rateCard(session, rating) {
  if (session.rating || !session.queue.length) return;
  const [current, ...pending] = session.queue;
  session.rating = rating;
  session.revealed = current;
  if (rating !== 'remembered') {
    const gap = rating === 'forgot' ? 1 : 3;
    pending.splice(Math.min(gap, pending.length), 0, current);
  }
  session.queue = pending;
}

export function selectExercises(exercises, selected, { sample = null, randomOrder = false } = {}) {
  const pool = exercises.filter(q => selected.has(q.nodeId) || q.groupIds.some(id => selected.has(id)));
  const picked = sample == null ? pool : shuffle(pool).slice(0, sample);
  if (randomOrder) return shuffle(picked);
  if (sample == null) return picked;
  const ids = new Set(picked.map(q => q.id));
  return pool.filter(q => ids.has(q.id));
}

const normalized = value => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

export function grade(q, response) {
  if (q.answer == null) return null;
  if (q.type === 'multiple') {
    return [...new Set(response ?? [])].sort().join('\0') === [...new Set(q.answer)].sort().join('\0');
  }
  if (q.type === 'paired') return q.answer.every((a, i) => a === response?.[i]);
  if (q.type === 'fill') {
    return (Array.isArray(q.answer) ? q.answer : [q.answer]).some(a => normalized(a) === normalized(response ?? ''));
  }
  return q.answer === response;
}

function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('vocabulary-library', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('books', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('书库正在另一页面更新，请关闭旧页面后重试。'));
  });
}

export async function readBooks() {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('books').objectStore('books').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function saveBook(book) {
  const db = await openStore();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('books', 'readwrite');
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error ?? new Error('书籍写入中断。'));
      const store = tx.objectStore('books');
      const existing = store.get(book.id);
      existing.onsuccess = () => {
        if (existing.result) {
          tx.abort();
          return;
        }
        store.add(book);
      };
    });
  } finally {
    db.close();
  }
}
