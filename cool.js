import got from 'got';
import { URL } from 'url';
import * as HTMLParser from 'node-html-parser';
import { CookieJar } from 'tough-cookie';
import fs from 'fs/promises';

const credentials = {
    login: 'eia16t213@student.bmstu.ru',
    password: 'CupheadMaster69',
}

const cookies = new CookieJar();
const libraryURLBase = new URL('https://bmstu.press');
const loginURLbase = new URL('https://sso.bmstu.com');

const libraryKey = getSecurityKey(
    HTMLParser.parse(
        (await got.get(libraryURLBase, {cookieJar: cookies})).body
    )
);

const initalPost = await got.post(new URL('/ajax/sso/login-oauth', libraryURLBase), {
    cookieJar: cookies,
    form: {
       'service': 'bmstu',
       'referal': libraryURLBase.toString(),
       'security_ls_key': libraryKey
    }
});

const initialPostResponse = JSON.parse(initalPost.body);
const redirectUrl = decodeURI(initialPostResponse['sUrl']);

const res = await got.get(new URL(redirectUrl), {cookieJar: cookies});
const loginPageKey = getSecurityKey(HTMLParser.parse(res.body));

// const res = await got.get(loginUrl);
// const root = HTMLParser.parse(res.body);

// const cookieString = res.headers['set-cookie'].find(item => item.includes('PHPSESSID'));
// const livestreetSecurityKey = getSecurityKey(root);
// cookies.setCookieSync(cookieString, loginUrl);
// // console.log(await cookies.getCookies(loginUrl));

const res2 = await got.post(new URL('/auth/ajax-login', loginURLbase), {
    form: {
        'login': credentials.login,
        'password': credentials.password,
        'remember': 1,
        'return-path': (new URL('/oauth/authorization_code/', loginURLbase)).toString(),
        'security_ls_key': loginPageKey
    },
   cookieJar: cookies
});

const loginPostResponse = JSON.parse(res2.body);
const loginRedirectUrl = decodeURI(loginPostResponse['sUrlRedirect']);

const res3 = await got.get(new URL(loginRedirectUrl), {cookieJar: cookies});
// console.log(cookies.getCookiesSync(libraryURLBase.toString()));

// const res4 = await got.get(new URL('/catalog/item/7295/reader', libraryURLBase), {cookieJar: cookies});
// console.log(res4.body);

const accessKeyCookie = cookies.serializeSync().cookies.find(cookie => {
    return (cookie.key == 'key') && (cookie.domain == libraryURLBase.hostname);
});
fs.writeFile('cookies.json', JSON.stringify(accessKeyCookie))
.then(val => console.log('Saved to file'))
.catch(err => console.log(err));

console.log(accessKeyCookie.value);

function getSecurityKey(root) {
    const scriptString = root.querySelector('head').innerHTML;
    return scriptString.match(/LIVESTREET_SECURITY_KEY = '([0-9a-f]{32})'/i)[1];
}