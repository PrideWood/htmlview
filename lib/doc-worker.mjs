import {parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
const WordExtractor=createRequire(import.meta.url)(workerData.parserPath);
try{
 const doc=await new WordExtractor().extract(Buffer.from(workerData.bytes));
 parentPort.postMessage({text:doc.getBody()});
}catch{
 parentPort.postMessage({error:true});
}
