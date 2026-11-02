// Static, self-hosted dictionary shards; no third-party request is made during lookup.
export function normalizeWord(value) {
 return String(value || '').trim().replace(/[’‘]/g, "'").toLowerCase();
}
export function validWord(value) {
 return value.length <= 80 && /^[a-z]+(?:['-][a-z]+)*$/.test(value);
}
const inflight = new Map();
async function shard(letter) {
 if (!inflight.has(letter)) {
  const pending = fetch(`/dictionary/${letter}.json`).then(async response => {
   if (!response.ok) throw new Error('内置词库暂时无法读取，请重试。');
   return response.json();
  }).catch(error => { inflight.delete(letter); throw error; });
  inflight.set(letter, pending);
  if (inflight.size > 8) inflight.delete(inflight.keys().next().value);
 }
 return inflight.get(letter);
}
function unpack(row) {
 const [word, phonetic, translation, definition, exchange, tag] = row;
 return {word, phonetic, translation, definition, exchange, tag};
}
export async function lookupWord(value) {
 const query = normalizeWord(value);
 if (!validWord(query)) return {query, invalid: true, entries: []};
 const data = await shard(query[0]);
 const row = Object.hasOwn(data.entries, query) ? data.entries[query] : null;
 const base = row?.[4].split('/').find(part => part.startsWith('0:'))?.slice(2).split(',')[0];
 const lemma = base && base !== query && validWord(base) ? base :
  Object.hasOwn(data.aliases, query) ? data.aliases[query] : null;
 const entries = row ? [unpack(row)] : [];
 if (lemma) {
  const related = await shard(lemma[0]);
  if (Object.hasOwn(related.entries, lemma)) entries.push(unpack(related.entries[lemma]));
 }
 return {query, entries};
}

// Return only the actual English token under the caret; Chinese, blanks and numbers do not match.
export function wordAtOffset(text, offset) {
 for (const match of text.matchAll(/[A-Za-z]+(?:['’‘-][A-Za-z]+)*/g)) {
  if (offset >= match.index && offset < match.index + match[0].length) {
   return {word: match[0], start: match.index, end: match.index + match[0].length};
  }
 }
 return null;
}
