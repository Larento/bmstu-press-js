import got from 'got';
import fs from 'fs/promises';
import archiver from 'archiver';
import streamZip from 'node-stream-zip';
import { URL } from 'url';
import { XMLParser } from 'fast-xml-parser';
import * as HTMLParser from 'node-html-parser';
import { group } from 'console';
import { CookieJar } from 'tough-cookie';

const XmlParser = new XMLParser({
    ignoreAttributes: false
});

const base = new URL('https://bmstu.press');
const uploadInfo = {
    year: '2021',
    month: '12',
    day: '03',
    hash: '46040faa1478075a2ef871b107cdb922'
}

const id = `/ebooks/${uploadInfo.year}/${uploadInfo.month}/${uploadInfo.day}/${uploadInfo.hash}`;

const bookInfo = {};

const mimetype = await getFile(`${id}/mimetype`, base);
const getItem = await getFile(`/catalog/item/7295/`, base);

const cookieJar = new CookieJar();
await cookieJar.setCookie('key=dab5953b8e15db29c79c1ba7d12ef809', base.toString());
// const res = (await got.get(new URL(`/catalog/item/7295/reader`, base), {cookieJar})).body;

const containerData = await getFile(`${id}/META-INF/container.xml`, base);
const containerObject = XmlParser.parse(containerData);

const packageDocData = await getFile(`${id}/${getPackageDocPath(containerObject)}`, base);
const packageDocObject = XmlParser.parse(packageDocData);
bookInfo.title = getTitle(packageDocObject);
bookInfo.upload_date = getModifiedDate(packageDocObject);

const itemRoot = HTMLParser.parse(getItem);
const info = itemRoot.querySelector('div.properties ul');
bookInfo.pages = info.innerHTML.match(/Объ[ё|е]м: (\d*)/i)[1];
bookInfo.release_year = info.innerHTML.match(/Год издания: (\d*)/i)[1];
bookInfo.edition = info.innerHTML.match(/Номер издания: (\d*)/i)[1];
bookInfo.ISBN = info.innerHTML.match(/(\d{3}-\d-\d{4}-\d{4}-\d)/i)[1];

const about = itemRoot.querySelector('div.area-about');
const heading = about.querySelectorAll(':not(br)');
heading.forEach((el) => el.remove());
bookInfo.description = about.textContent.trim();

const tags = itemRoot.querySelectorAll('div.info__tag a');
const tagNames = [...tags].map(tag => {
    const urlString = tag.getAttribute('href');
    const url = new URL(urlString);
    return decodeURI(url.hash.match(/search=(.*)/i)[1]);
});

const authors = itemRoot.querySelectorAll('div.info__author a');
const authorIDs = [...authors].map(author => {
    const urlString = author.getAttribute('href');
    const url = new URL(urlString);
    const parsedUrl = url.pathname.split('/');
    return decodeURI(parsedUrl[parsedUrl.length-2]);
});


// const readerRoot = HTMLParser.parse(res);
// const contentURL = new URL(readerRoot.querySelector('#app-reader app-reader').getAttribute('url'));

console.log(bookInfo);
console.log(tagNames);
console.log(authorIDs);
// console.log(contentURL.toString());



// security_ls_key=ee16b6b91595c0f08775d65f6f6d5d76
// f13fb2b253bd850df6b4f5ce58981349

async function getFile(location, base) {
    const url = new URL(location, base);
    const res = await got.get(url);
    // console.log(`${location} done in ${res.timings.phases.total}`)
    return res.body;
}

function getPackageDocPath(containerObject) {
    return containerObject['container']['rootfiles']['rootfile']['@_full-path'];
}

function getTitle(contentObject) {
    return contentObject['package']['metadata']['dc:title'];
}

function getModifiedDate(contentObject) {
    const metaModifiedDate =  contentObject['package']['metadata']['meta'].find(item => {
        if (item.hasOwnProperty('@_property')) {
            if (item['@_property'].includes('modified')) return true;
        }
        return false;
    });
    return metaModifiedDate['#text'];
}

// files.forEach(async fileLocator => {
//     const file = await got.get(new URL(id + fileLocator, base));
//     console.log(file);
// });