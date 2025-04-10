// const express = require('express');
// const cors = require('cors');
// const dotenv = require('dotenv');
// const { OpenAI } = require('openai');
// const multer = require('multer');
// const fs = require('fs');
// const path = require('path');

// dotenv.config();
// const app = express();
// const PORT = process.env.PORT || 5000;

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

// app.use(cors());
// app.use(express.json());

// // AI chat response endpoint
// app.post('/api/generate', async (req, res) => {
//   try {
//     const { prompt } = req.body;

//     const completion = await openai.chat.completions.create({
//       model: 'gpt-4',
//       messages: [{ role: 'user', content: prompt }],
//     });

//     res.json({ result: completion.choices[0].message.content });
//   } catch (error) {
//     console.error('AI response error:', error.message);
//     res.status(500).json({ error: 'Something went wrong with AI response' });
//   }
// });

// // File upload setup
// const upload = multer({ dest: 'uploads/' });

// app.post('/api/transcribe', upload.single('file'), async (req, res) => {
//   try {
//     const file = req.file;

//     if (!file) {
//       return res.status(400).json({ error: 'No audio file uploaded' });
//     }

//     // Optional: cleaner dev log
//     if (process.env.NODE_ENV !== 'production') {
//       console.log(`Uploaded: ${file.originalname} (${file.size} bytes)`);
//     }

//     const newPath = `${file.path}.mp3`; // or .m4a if needed
//     fs.renameSync(file.path, newPath);

//     const transcription = await openai.audio.transcriptions.create({
//       file: fs.createReadStream(newPath),
//       model: 'whisper-1',
//     });

//     fs.unlinkSync(newPath); // Delete the file after use

//     if (process.env.NODE_ENV !== 'production') {
//       console.log(`Transcription successful: ${transcription.text}`);
//     }

//     res.json({ text: transcription.text });
//   } catch (error) {
//     const message = error?.response?.data || error.message;
//     console.error('Whisper transcription error:', message);
//     res.status(500).json({ error: 'Failed to transcribe audio' });
//   }
// });

// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });
