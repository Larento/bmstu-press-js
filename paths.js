import path from 'path';
import fs from 'fs';

const coversFolder = path.resolve('books', 'covers');
console.log(coversFolder); 

const tempFolder = path.resolve('temp');
const dirName = 'dud';
const dirPath = path.resolve(tempFolder, dirName);

const index = path.resolve(dirPath, 'index.html');
console.log(index);

console.log(fs.readdirSync(coversFolder));