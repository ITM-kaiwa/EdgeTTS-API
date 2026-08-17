const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const ALLOWED_ORIGIN = 'https://itm-kaiwa.github.io';

module.exports = async function handler(req, res) {
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

  console.log(`TTS request: voice=${voice}, text="${text}"`);

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const { audioStream } = await tts.toStream(text);

    // Buffer all chunks before sending (more reliable in serverless)
    const chunks = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    if (chunks.length === 0) {
      return res.status(500).send('TTS Error: No audio data received from Microsoft');
    }

    const audioBuffer = Buffer.concat(chunks);
    console.log(`TTS success: ${audioBuffer.length} bytes`);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(audioBuffer);

  } catch (err) {
    const message = err?.message || err?.toString() || 'Unknown error';
    console.error('TTS error:', message, err);
    return res.status(500).send(`TTS Error: ${message}`);
  }
};
