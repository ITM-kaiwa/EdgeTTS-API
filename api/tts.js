const WebSocket = require('ws');

const ALLOWED_ORIGIN = 'https://itm-kaiwa.github.io';
const TTS_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const TTS_WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TTS_TOKEN}`;

const WSS_HEADERS = {
  'Pragma': 'no-cache',
  'Cache-Control': 'no-cache',
  'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
  'Accept-Encoding': 'gzip, deflate, br',
  'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91',
};

function generateId() {
  return require('crypto').randomBytes(16).toString('hex');
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function synthesize(text, voice) {
  return new Promise((resolve, reject) => {
    const connId = generateId();
    const url = `${TTS_WSS_URL}&ConnectionId=${connId}`;

    const ws = new WebSocket(url, { headers: WSS_HEADERS });
    ws.binaryType = 'nodebuffer';

    const chunks = [];
    let didReceiveAudio = false;

    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('Timeout: no response from Microsoft TTS within 15s'));
    }, 15000);

    ws.on('open', () => {
      console.log('WebSocket connected to Microsoft TTS');

      // Send config
      ws.send(
        `X-Timestamp:${new Date().toISOString()}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
              },
            },
          },
        })
      );

      // Send SSML
      const reqId = generateId();
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ja-JP'>` +
        `<voice name='${voice}'>${escapeXml(text)}</voice>` +
        `</speak>`;

      ws.send(
        `X-RequestId:${reqId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${new Date().toISOString()}\r\n` +
        `Path:ssml\r\n\r\n` +
        ssml
      );
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // Strip the binary header (text before \r\n\r\n)
        const headerEnd = data.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          const audio = data.slice(headerEnd + 4);
          if (audio.length > 0) {
            chunks.push(audio);
            didReceiveAudio = true;
          }
        }
      } else {
        const text = data.toString();
        if (text.includes('Path:turn.end')) {
          clearTimeout(timer);
          ws.close();
          if (didReceiveAudio) {
            resolve(Buffer.concat(chunks));
          } else {
            reject(new Error('turn.end received but no audio data was captured'));
          }
        }
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      console.error('WebSocket error:', err);
      reject(new Error(`WebSocket error: ${err.message} (code: ${err.code})`));
    });

    ws.on('close', (code, reason) => {
      if (!didReceiveAudio) {
        clearTimeout(timer);
        reject(new Error(`WebSocket closed unexpectedly: code=${code}, reason=${reason}`));
      }
    });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const text  = req.query.text;
  const voice = req.query.voice || 'ja-JP-NanamiNeural';

  if (!text) return res.status(400).send('Missing text parameter');

  console.log(`TTS request: voice=${voice}, text="${text}"`);

  try {
    const audioBuffer = await synthesize(text, voice);
    console.log(`TTS success: ${audioBuffer.length} bytes`);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(audioBuffer);
  } catch (err) {
    const msg = err?.message || String(err) || 'Unknown error';
    console.error('TTS failed:', msg);
    return res.status(500).send(`TTS Error: ${msg}`);
  }
};
