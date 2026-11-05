import {access} from 'node:fs/promises';
await access(new URL('../public/index.html',import.meta.url));
await access(new URL('../seed/lessons.json',import.meta.url));
await access(new URL('../lib/doc-worker.mjs',import.meta.url));
console.log('Static frontend and server function are ready.');

await access(new URL('../seed/selected-papers.json',import.meta.url));
await access(new URL('../seed/eight-course-lessons.json',import.meta.url));
await access(new URL('../seed/eight-course-teaching.json',import.meta.url));
