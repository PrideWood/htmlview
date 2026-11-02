import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeWord, validWord, wordAtOffset} from '../public/dictionary-data.js';

test('单词定位不吞入中文、空白、标点和数字；保留连字符与撇号', () => {
 const text = '中文 Hello, well-known isn’t 2026.';
 assert.equal(wordAtOffset(text, 0), null);
 assert.equal(wordAtOffset(text, text.indexOf(',')), null);
 assert.equal(wordAtOffset(text, text.indexOf('2026')), null);
 assert.equal(wordAtOffset(text, text.indexOf('known')).word, 'well-known');
 assert.equal(wordAtOffset(text, text.indexOf('n’t')).word, 'isn’t');
 assert.equal(wordAtOffset(text, 3).word, 'Hello');
 assert.equal(normalizeWord('  Isn’t  '), "isn't");
 for (const value of ['', 'a b', '../x', '<script>', 'a'.repeat(81), '中文']) assert.equal(validWord(value), false);
});

async function dictionaryHarness() {
 const requests = [];
 const nativeFetch = globalThis.fetch;
 let fail = false;
 globalThis.fetch = async url => {
  requests.push(url);
  if (fail) {fail = false; return {ok:false};}
  const data = JSON.parse(await readFile(new URL('../public' + url, import.meta.url), 'utf8'));
  return {ok:true, json:async () => data};
 };
 const module = await import('../public/dictionary-data.js?harness=' + Math.random());
 return {...module, requests, failNext:() => {fail = true;}, restore:() => {globalThis.fetch = nativeFetch;}};
}

test('真实内置词库查询：大小写、中文释义、跨包不规则原形和词形别名', async () => {
 const h = await dictionaryHarness();
 try {
  const book = await h.lookupWord('BOOK');
  assert.match(book.entries[0].translation, /书/);
  assert.equal(book.entries[0].word.toLowerCase(), 'book');
  const went = await h.lookupWord('went');
  assert.ok(went.entries.some(entry => entry.word === 'go'));
  const children = await h.lookupWord('children');
  assert.ok(children.entries.some(entry => entry.word === 'child'));
  const running = await h.lookupWord('running');
  assert.ok(running.entries.some(entry => entry.word === 'run'));
  assert.equal((await h.lookupWord('zzzznotaword')).entries.length, 0);
  const count = h.requests.length;
  assert.equal((await h.lookupWord('../bad')).invalid, true);
  assert.equal(h.requests.length, count);
 } finally {h.restore();}
});

test('词库并发查询复用请求；加载失败后允许重试', async () => {
 const h = await dictionaryHarness();
 try {
  await Promise.all([h.lookupWord('apple'), h.lookupWord('answer')]);
  assert.equal(h.requests.filter(url => url === '/dictionary/a.json').length, 1);
  h.failNext();
  await assert.rejects(h.lookupWord('book'), /重试/);
  assert.match((await h.lookupWord('book')).entries[0].translation, /书/);
 } finally {h.restore();}
});

test('词典包清单、分片、所有词形引用和许可证完整', async () => {
 const root = new URL('../public/dictionary/', import.meta.url);
 const read = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
 const manifest = await read('manifest.json');
 const shards = await Promise.all([...'abcdefghijklmnopqrstuvwxyz'].map(letter => read(letter + '.json')));
 const entries = Object.assign({}, ...shards.map(shard => shard.entries));
 const aliases = Object.assign({}, ...shards.map(shard => shard.aliases));
 assert.equal(Object.keys(entries).length, manifest.entries);
 assert.equal(Object.keys(aliases).length, manifest.aliases);
 assert.ok(manifest.entries > 50000);
 for (const [word, row] of Object.entries(entries)) {
  assert.equal(row.length, 6);
  assert.ok(row[2], word);
 }
 for (const [word, lemma] of Object.entries(aliases)) {
  assert.ok(entries[lemma], `${word} -> ${lemma}`);
  assert.equal(entries[word], undefined);
 }
 assert.match(await readFile(new URL('LICENSE-ECDICT.txt', root), 'utf8'), /Permission is hereby granted/);
});
