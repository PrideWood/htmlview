"""Build the bundled ECDICT dictionary: python3 scripts/build-dictionary.py /path/to/ecdict.csv.

The source CSV is not needed at runtime. See public/dictionary/README.md.
"""
import csv
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(sys.argv[1])
OUT = ROOT / 'public/dictionary'
WORD = re.compile(r"[a-z]+(?:['-][a-z]+)*", re.I)
PHRASE = re.compile(r"[a-z]+(?:['-][a-z]+)*(?: [a-z]+(?:['-][a-z]+)*){1,4}", re.I)
COMMON = set('take get give look go come put turn make have keep break bring carry set run pick cut fall in on at by for with out as be a an the'.split())
lesson_words = set(re.findall(r"[a-z]+(?:['-][a-z]+)*", (ROOT / 'seed/lessons.json').read_text().lower()))


def frequent(value):
    return value.isdigit() and 0 < int(value) <= 50000


entries = {}
with SOURCE.open(encoding='utf-8-sig', newline='') as stream:
    for row in csv.DictReader(stream):
        key = row['word'].lower()
        phrase = len(key) <= 80 and PHRASE.fullmatch(key) and key.split()[0] in COMMON
        if not (WORD.fullmatch(key) or phrase) or not row['translation']:
            continue
        if not (phrase or row['tag'] or frequent(row['bnc']) or frequent(row['frq']) or key in lesson_words):
            continue
        entry = [row[k].replace('\\n', '\n') for k in ('word', 'phonetic', 'translation', 'definition', 'exchange', 'tag')]
        # Prefer a lowercase headword if the source contains case variants.
        if key not in entries or row['word'] == key:
            entries[key] = entry

# Only use explicit ECDICT inflections, never guess stems by stripping suffixes.
aliases = {}
for key, entry in sorted(entries.items()):
    for exchange in entry[4].split('/'):
        kind, _, forms = exchange.partition(':')
        if kind not in ('p', 'd', 'i', '3', 'r', 't', 's'):
            continue
        for form in forms.split(','):
            if WORD.fullmatch(form) and form.lower() not in entries:
                aliases.setdefault(form.lower(), key)

shards = {letter: {'entries': {}, 'aliases': {}} for letter in 'abcdefghijklmnopqrstuvwxyz'}
for key, entry in sorted(entries.items()):
    shards[key[0]]['entries'][key] = entry
for key, value in sorted(aliases.items()):
    shards[key[0]]['aliases'][key] = value
OUT.mkdir(exist_ok=True)
for key, shard in shards.items():
    (OUT / f'{key}.json').write_text(json.dumps(shard, ensure_ascii=False, separators=(',', ':')) + '\n')
manifest = {
    'source': 'https://github.com/skywind3000/ECDICT',
    'license': 'MIT', 'sourceSHA256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'entries': len(entries), 'aliases': len(aliases),
    'fields': ['word', 'phonetic', 'translation', 'definition', 'exchange', 'tag'],
    'selection': 'All tagged exam words, BNC/COCA frequency <= 50000, and built-in lesson vocabulary; English single words, plus 2–5 word phrases beginning with common verbs, articles or prepositions; all with Chinese translations.',
}
(OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(manifest, ensure_ascii=False, indent=2))
