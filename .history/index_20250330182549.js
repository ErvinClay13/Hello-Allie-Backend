const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
app.use(express.json());

// Set up multer for file uploads
const upload = multer({ dest: 'uploads/' });

// ChatGPT endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;
    console.log('Prompt received:', prompt);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    });

    const reply = completion.choices[0].message.content;
    console.log('AI Response:', reply);
    res.json({ result: reply });
  } catch (error) {
    console.error('ChatGPT error:', error.message);
    res.status(500).json({ error: 'Failed to get AI response' });
  }
});

// Whisper endpoint
app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  console.log('HIT /api/transcribe');

  try {
    const file = req.file;
    console.log('Uploaded file:', file);

    if (!file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const filePath = path.resolve(file.path);
    const fileMime = mime.lookup(file.originalname);
    console.log('Detected MIME type:', fileMime);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-1',
    });

    fs.unlinkSync(filePath);
    console.log('Transcription result:', transcription.text);
    res.json({ text: transcription.text });
  } catch (error) {
    console.error('Transcription error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

// Fallback for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});






// const cors = require('cors');
// const dotenv = require('dotenv');
// const { OpenAI } = require('openai');
// const multer = require('multer');
// const fs = require('fs');

// dotenv.config();
// const app = express();
// const PORT = process.env.PORT || 5000;

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

// app.use(cors());
// app.use(express.json());

// // Endpoint for AI chat responses
// app.post('/api/generate', async (req, res) => {
//   try {
//     const { prompt } = req.body;

//     const completion = await openai.chat.completions.create({
//       model: 'gpt-4',
//       messages: [{ role: 'user', content: prompt }],
//     });

//     res.json({ result: completion.choices[0].message.content });
//   } catch (error) {
//     console.error('Error:', error.message);
//     res.status(500).json({ error: 'Something went wrong' });
//   }
// });

// // Setup file upload for Whisper transcription
// const upload = multer({ dest: 'uploads/' });

// app.post('/api/transcribe', upload.single('file'), async (req, res) => {
//   try {
//     const file = req.file;

//     if (!file) {
//       return res.status(400).json({ error: 'No audio file uploaded' });
//     }

//     const transcription = await openai.audio.transcriptions.create({
//       file: fs.createReadStream(file.path),
//       model: 'whisper-1',
//     });

//     fs.unlinkSync(file.path);

//     res.json({ text: transcription.text });
//   } catch (error) {
//     console.error('Transcription error:', error.message);
//     res.status(500).json({ error: 'Failed to transcribe audio' });
//   }
// });

// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });
