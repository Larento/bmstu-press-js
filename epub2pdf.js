import puppeteer from "puppeteer";
import fs, { readFileSync, writeFileSync } from 'fs';
import fsAsync from 'fs/promises';
import path from "path";
import * as HTMLParser from 'node-html-parser';
import pdflib, { PDFDocument, PDFName } from 'pdf-lib';
import { XMLParser } from "fast-xml-parser";
import { get } from "http";
import { outlinePdfFactory } from "@lillallol/outline-pdf";
import doc from "pdfkit";
import StreamZip from "node-stream-zip";
import crypto from 'crypto';

const tempDir = path.resolve('temp');
const bookStorageDir = path.resolve('books');
const serveDir = path.resolve('serve');
const bookCoversDir = path.resolve(bookStorageDir, 'covers');
const indexHTMLFile = 'index.html';

const outlinePdf = outlinePdfFactory(pdflib);
const XmlParser = new XMLParser({
    ignoreAttributes: false
});

const books = [
    // 'book1',
    // 'book2',
    // 'Расчет систем механической вентиляции',
    // 'Исследование микроклимата воздуха рабочих зон производственных помещений',
    'Методические указания по выполнению экономической части дипломных проектов',
];

const browser = await puppeteer.launch();

if (!fs.existsSync(tempDir)){
    fs.mkdirSync(tempDir);
}

console.time();
await Promise.all(books.map(book => convertBook(browser, book, 20)));
console.timeEnd();

await browser.close();

removeTempDirectory(tempDir);

async function convertBook(browser, bookName, maxConcurrentPDFPages = 15, dud = false) {
    const epubContainer = new StreamZip.async({
        file: path.resolve(path.join(bookStorageDir, `${bookName}.zip`))
    });

    const packageDocXMLObject = await getPackageDocObject(epubContainer);
    const resourceFiles = getResourceFiles(packageDocXMLObject);
    const spine = getSpine(packageDocXMLObject);
    const paths = getPaths(resourceFiles, spine);
    const bookmarks = await getBookmarks(resourceFiles, epubContainer);

    const description = packageDocXMLObject['package']['metadata']['dc:description'];
    const size = description.match(/(?<width>\d*\.\d*(?= cm)).*\D(?<height>\d*\.\d*(?= cm))/i).groups;
    const cmSize = {
        width: parseFloat(size.width, 10),
        height: parseFloat(size.height, 10)
    }

    const pageDims = {
        width: cmSize.width / 2.54 * 72,
        height: cmSize.height / 2.54 * 72
    };
    
    let doc = await PDFDocument.create();
    const bookTempDir = setupBookTempDirectory(tempDir);
    const coverPage = doc.addPage();
    coverPage.setSize(pageDims.width, pageDims.height);

    if (dud) {
        coverPage.drawText('Cover page');
        paths.forEach((element, index) => {
            const page = doc.addPage()
            page.setSize(pageDims.width, pageDims.height);
            page.drawText(`Page ${index + 1}`);
        });
    } else {
        const coverImage = await doc.embedJpg(readFileSync(path.resolve(bookCoversDir, `${bookName}.jpg`)));
        const coverDims = coverImage.scaleToFit(pageDims.width, pageDims.height);

        coverPage.setSize(coverDims.width, coverDims.height);
        coverPage.drawImage(coverImage, {
            width: coverDims.width,
            height: coverDims.height
        });
        const page = await browser.newPage();
        await page.goto(`file://${path.resolve(bookTempDir, indexHTMLFile)}`);

        doc = await makePDF({
            bookName: bookName,
            cmSize: cmSize,
            epubContainer: epubContainer,
            pdfDoc: doc,
            bookPagesFilePaths: paths,
            maxConcurrentPDFPages: maxConcurrentPDFPages,
            puppeteerPage: page,
            bookTempDir: bookTempDir,
            resourceFiles: resourceFiles
        });
    }
    
    const pageLabels = doc.context.obj({
        Nums: [
            0, { S: 'r' },
            1, { S: 'D' },
        ]
    });

    doc.catalog.set(PDFName.of('PageLabels'), pageLabels);

    const outlinedDoc = await outlinePdf({
        pdf: doc,
        outline: bookmarks
    });

    writeFileSync(`serve/${bookName}.pdf`, await outlinedDoc.save());
    await epubContainer.close();

    removeTempDirectory(bookTempDir);
}

function getIndex() {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="ie=edge">
        <title>HTML 5 Boilerplate</title>
    </head>
    <body>
    </body>
    </html>
    `
}

function setupBookTempDirectory(parentTempDirectory) {
    const dirName = crypto.randomBytes(16).toString('hex');
    const dirPath = path.resolve(parentTempDirectory, dirName);
    fs.mkdirSync(dirPath);
    writeFileSync(path.resolve(dirPath, indexHTMLFile), getIndex());
    return dirPath;
}

function removeTempDirectory(tempDirectory) {
    fs.rmSync(tempDirectory, {
        recursive: true,
        force: true
    });
}


async function makePDF({ bookName, cmSize, epubContainer, pdfDoc, resourceFiles, bookPagesFilePaths, maxConcurrentPDFPages, puppeteerPage, bookTempDir }) {
    while (bookPagesFilePaths.length > 0) {
        const bufferArray = [];
        const chunk = bookPagesFilePaths.splice(0, maxConcurrentPDFPages);

        console.log(`New chunk`);
    
        for (let i = 0; i < chunk.length; i++) {
            const htmlBuffer = (await epubContainer.entryData(`OEBPS/${chunk[i]}`)).toString('utf-8');

            const have = getExistingFiles(bookTempDir, resourceFiles);
            const depends = getDependencies(htmlBuffer, resourceFiles);

            const copy = difference(union(have, depends), have);
            const deletes = difference(union(have, depends), depends);

            await Promise.all(Array.from(deletes).map(item => {
                return fsAsync.rm(path.resolve(bookTempDir, item));
            }));

            await Promise.all(Array.from(copy).map(item => {
                return epubContainer.extract(path.join('OEBPS', item), bookTempDir);
            }));

            bufferArray[i] = await getPDFBuffer(puppeteerPage, htmlBuffer, cmSize);
            console.log(`Done page ${getPageNumber(chunk[i])}`);
        };

        for (let i = 0; i < chunk.length; i++) {
            await addPDFPage(chunk[i], bufferArray, pdfDoc, maxConcurrentPDFPages);
        };

        writeFileSync(path.resolve(serveDir, `${bookName}.pdf`), await pdfDoc.save());
        pdfDoc = await PDFDocument.load(readFileSync(path.resolve(serveDir, `${bookName}.pdf`)));

        console.log();
    }
    return pdfDoc;
}

function getExistingFiles(directory, resourceFiles) {
    const fileSet =  new Set(fs.readdirSync(directory));
    const resourcesSet = new Set(resourceFiles.map(item => item['@_href']));
    return intersection(fileSet, resourcesSet);
}

function getDependencies(htmlBuffer, resourceFiles) {
    const root = HTMLParser.parse(htmlBuffer);
    const styleSheets = root.querySelectorAll('link[type="text/css"]').map(link => link.getAttribute('href'));

    const usedFonts = resourceFiles
    .filter(item => item['@_media-type'].includes('application/font'))
    .filter(font => root.querySelector(`*.f${font['@_id']}`))
    .map(item => item['@_href']);

    const images = root.querySelectorAll('img').map(item => item.getAttribute('src'));

    return new Set([].concat(styleSheets, usedFonts, images));
}

async function addPDFPage(path, bufferArray, pdfDoc, maxConcurrentPDFPages) {
    const pageNum = getPageNumber(path);
    const index = (pageNum - 1) % maxConcurrentPDFPages;
    const buf = bufferArray[index];
    const newPDF = await PDFDocument.load(buf);
    const [existingPage] = await pdfDoc.copyPages(newPDF, [0]);
    pdfDoc.addPage(existingPage);
}

async function getPDFBuffer(puppeteerPage, htmlBuffer, cmSize) {
    await puppeteerPage.setDefaultNavigationTimeout(0);
    await puppeteerPage.setContent(htmlBuffer, {waitUntil: 'domcontentloaded'});

    return puppeteerPage.pdf({
        width: `${cmSize.width}cm`,
        height: `${cmSize.height}cm`
    });
}

async function getPackageDocObject(epubContainerZip) {
    const containerData = await epubContainerZip.entryData(`META-INF/container.xml`);
    const packageDocPath = XmlParser.parse(containerData)['container']['rootfiles']['rootfile']['@_full-path'];
    const packageDocData = await epubContainerZip.entryData(`${packageDocPath}`);
    return XmlParser.parse(packageDocData);
}

function getResourceFiles(packageDocObject) {
    return packageDocObject['package']['manifest']['item'];
}

function getSpine(packageDocObject) {
    return packageDocObject['package']['spine']['itemref'];
}

function getPaths(resourceFiles, spine) {
    return spine.map(file => {
        return resourceFiles.find(resourceFile => resourceFile['@_id'] == file['@_idref'])['@_href'];
    });
}

async function getBookmarks(resourceFiles, epubContainerZip) {
    const navFilePath = resourceFiles.find(file => {
        return (file.hasOwnProperty('@_properties')) && (file['@_properties'].includes('nav'));
    })['@_href'];
    
    const navHTMLBuffer = await epubContainerZip.entryData(`OEBPS/${navFilePath}`);
    const navHTMLObject = HTMLParser.parse(navHTMLBuffer);
    const navList = navHTMLObject.querySelector('nav#toc > ol');
    return processNavList(navList);
}

function getSizes(pageHTMLObject) {
    const sizeString = pageHTMLObject.querySelector('head meta[name="viewport"]').getAttribute('content');
    const sizes = sizeString.match(/^width=(?<width>\d*).*height=(?<height>\d*)$/i).groups;
    return {
        width:  parseInt(sizes.width, 10),
        height: parseInt(sizes.height, 10)
    }
}

function getPageNumber(path) {
    return parseInt(path.match(/^.*(?<pageNum>\d{4}).*$/i).groups['pageNum'], 10);
}

function genOutlineString(page, level, title, collapsed = false) {
    let string = collapsed ? `-` : ``;
    string += page + 1;
    string += '|';
    if (level < 1) level = 1;
    for (let i = 0; i < level - 1; i++) {
        string += '-';
    }
    string += '|';
    string += title;
    return string + '\n';
}

function processNavList(list, level = 1) {
    let outlineString = '';
    list.querySelectorAll('>li').forEach(item => {
        const anchor = item.querySelector('a');
        const page = getPageNumber(anchor.getAttribute('href'));
        const title = anchor.textContent.replace(/[ ]{2}|\r\n|\n|\r/gm, '');
        outlineString += genOutlineString(page, level, title);
        const childList = item.querySelector('ol');
        if (childList != null) {
            outlineString += processNavList(childList, level + 1);
        }
    });
    return outlineString;
}

function isSuperset(set, subset) {
    for (let elem of subset) {
        if (!set.has(elem)) {
            return false
        }
    }
    return true
}

function union(setA, setB) {
    let _union = new Set(setA)
    for (let elem of setB) {
        _union.add(elem)
    }
    return _union
}

function intersection(setA, setB) {
    let _intersection = new Set()
    for (let elem of setB) {
        if (setA.has(elem)) {
            _intersection.add(elem)
        }
    }
    return _intersection
}

function symmetricDifference(setA, setB) {
    let _difference = new Set(setA)
    for (let elem of setB) {
        if (_difference.has(elem)) {
            _difference.delete(elem)
        } else {
            _difference.add(elem)
        }
    }
    return _difference
}

function difference(setA, setB) {
    let _difference = new Set(setA)
    for (let elem of setB) {
        _difference.delete(elem)
    }
    return _difference
}