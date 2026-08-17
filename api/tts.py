from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import asyncio
import edge_tts

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', 'https://itm-kaiwa.github.io')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed_path = urlparse(self.path)
        query = parse_qs(parsed_path.query)

        text = query.get('text', [''])[0]
        voice = query.get('voice', ['ja-JP-NanamiNeural'])[0]

        if not text:
            self.send_response(400)
            self.send_header('Access-Control-Allow-Origin', 'https://itm-kaiwa.github.io')
            self.end_headers()
            self.wfile.write(b"Missing text parameter")
            return

        try:
            audio_data = asyncio.run(self.synthesize(text, voice))
            
            self.send_response(200)
            self.send_header('Content-Type', 'audio/mpeg')
            self.send_header('Access-Control-Allow-Origin', 'https://itm-kaiwa.github.io')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(audio_data)
        except Exception as e:
            self.send_response(500)
            self.send_header('Access-Control-Allow-Origin', 'https://itm-kaiwa.github.io')
            self.end_headers()
            self.wfile.write(f"TTS Error: {str(e)}".encode('utf-8'))

    async def synthesize(self, text, voice):
        communicate = edge_tts.Communicate(text, voice)
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        return audio_data
