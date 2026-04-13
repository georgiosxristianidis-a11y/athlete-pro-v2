const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

router.post('/coach/chat', async (req, res) => {
  try {
    const { message, context } = req.body;
    const prompt = `Ты элитный ИИ-тренер. Отвечай кратко, мотивирующе и по делу.
Контекст последних тренировок пользователя: ${JSON.stringify(context)}
Сообщение пользователя: ${message}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    res.json({ reply: response.text });
  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

module.exports = router;
