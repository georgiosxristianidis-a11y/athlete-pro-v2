import express from 'express';
import cors from 'cors';
import { EdgeTTS } from '@andresaya/edge-tts';

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/lab/tts', async (req, res) => {
  try {
    const { text, pitch = '+0Hz', rate = '+0%' } = req.body;
    
    console.log(`Generating TTS: pitch=${pitch}, rate=${rate}`);
    const tts = new EdgeTTS();
    await tts.synthesize(text, 'ru-RU-DmitryNeural', { pitch, rate });
    
    const audioBase64 = tts.toBase64();
    res.json({ success: true, audioBase64 });
  } catch (err) {
    console.error('TTS Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 8081;
app.listen(PORT, () => {
  console.log(`🎙️ Voice Lab Server running at http://localhost:${PORT}`);
});
