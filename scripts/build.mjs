import {access} from 'node:fs/promises';
await access(new URL('../public/index.html',import.meta.url));
await access(new URL('../seed/lessons.json',import.meta.url));
console.log('Static frontend and server function are ready.');
