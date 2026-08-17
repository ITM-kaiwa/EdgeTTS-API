const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const ALLOWED_ORIGIN = 'https://itm-kaiwa.github.io';

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const text  = req.query.text;
  const voice = req.query.voice || 'ja-JP-NanamiNeural';

  if (!text) {
    return res.status(400).send('Missing text parameter');
  }

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = await tts.toStream(text);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');

    audioStream.pipe(res);

    audioStream.on('error', (err) => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).send('Stream error');
      }
    });
  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).send(`TTS Error: ${err.message}`);
  }
};
