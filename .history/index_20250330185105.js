const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
app.use(express.json());

// AI text generation endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    });

    res.json({ result: completion.choices[0].message.content });
  } catch (error) {
    console.error('Text generation error:', error.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Setup file upload for Whisper transcription
const upload = multer({ dest: 'uploads/' });

app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    console.log('HIT /api/transcribe');
    console.log('Uploaded file:', file);

    // Rename file to add the correct extension
    const extension = '.mp3'; // Update this if you’re using m4a instead
    const newPath = `${file.path}${extension}`;
    fs.renameSync(file.path, newPath);

    console.log('Renamed file path:', newPath);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(newPath),
      model: 'whisper-1',
    });

    console.log('Whisper result:', transcription.text);

    fs.unlinkSync(newPath); // Cleanup

    res.json({ text: transcription.text });
  } catch (error) {
    const message = error?.response?.data || error.message;
    console.error('Transcription error:', message);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

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
