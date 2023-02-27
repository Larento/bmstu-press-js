import puppeteer from "puppeteer";
import {readFileSync, writeFileSync} from 'fs';
import StreamZip from "node-stream-zip";
import * as HTMLParser from 'node-html-parser';
import path from "path";
import { create } from "domain";

const browser = await puppeteer.launch({
    // headless: false
});

const page = await browser.newPage();

await page.setRequestInterception(true)

page.on('request', (request) =>
    console.log('>>', request.method(), request.url())
  )

page.on('response', (response) =>
console.log('<<', response.status(), response.url())
)

await page.goto(`file://${path.resolve(`books/book1/OEBPS/index.html`)}`, {waitUntil: 'networkidle0'});

await createPDF('mybook0001', page);
await createPDF('mybook0002', page);
await createPDF('mybook0003', page);
await createPDF('mybook0004', page);

await browser.close();

async function createPDF(name, page) {
    await page.setContent(readFileSync(`books/book1/OEBPS/${name}.xhtml`, {encoding: 'utf-8'}), {waitUntil: 'networkidle0'});
    await page.pdf({
        path: `${name}.pdf`,
        width: 900,
        height: 1200
    });
}




// const have = new Set([
//   'css1',
//   'css2',
//   'svg1',
//   'svg2',
//   'ff1',
//   'ff2'
// ]);

// const depends = new Set([
//   'css1',
//   'css2',
//   'svg3',
//   'svg4',
//   'svg5',
//   'ff1',
//   'ff2',
//   'ff3'
// ]);

// const deletes = difference(union(have, depends), depends);
// const copy = difference(union(have, depends), have);

// console.log(deletes);
// console.log(copy);