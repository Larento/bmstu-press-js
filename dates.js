const bookInfo = {};
bookInfo.hash = 'asdasd';

const date = new Date('2022-06-10T10:24:54Z');
const upload_year = date.getUTCFullYear();
const upload_month = date.getUTCMonth() + 1;
const upload_day = date.getUTCDate();

const contentUrl = new URL(`https://bmstu.press/ebooks/${upload_year}/${upload_month}/${upload_day}/${bookInfo.hash}`);

console.log(contentUrl.toString());