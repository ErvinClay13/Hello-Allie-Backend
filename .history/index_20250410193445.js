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









// const express = require('express');
// const cors = require('cors');
// const dotenv = require('dotenv');
// const { OpenAI } = require('openai');
// const multer = require('multer');
// const fs = require('fs');
// const axios = require('axios');

// dotenv.config();
// const app = express();
// const PORT = process.env.PORT || 5000;

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

// app.use(cors());
// app.use(express.json());

// // Detect if prompt is a weather request
// const isWeatherRequest = (text) => {
//   return /weather in ([a-zA-Z\s]+)/i.test(text);
// };

// const extractCity = (text) => {
//   const match = text.match(/weather in ([a-zA-Z\s]+)/i);
//   return match ? match[1].trim() : null;
// };

// const fetchWeather = async (city) => {
//   try {
//     const response = await axios.get(`https://open-weather13.p.rapidapi.com/city/${city}/EN`, {
//       headers: {
//         'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
//         'X-RapidAPI-Host': 'open-weather13.p.rapidapi.com',
//       },
//     });

//     const data = response.data;
//     return `The current weather in ${data.name}, ${data.sys.country} is ${data.weather[0].description} with a temperature of ${data.main.temp}°C.`;
//   } catch (error) {
//     console.error('Weather API error:', error?.response?.data || error.message);
//     return `Sorry, I couldn't retrieve the weather for "${city}".`;
//   }
// };

// // AI chat response endpoint
// app.post('/api/generate', async (req, res) => {
//   try {
//     const { prompt } = req.body;

//     if (isWeatherRequest(prompt)) {
//       const city = extractCity(prompt);
//       if (city) {
//         const weather = await fetchWeather(city);
//         return res.json({ result: weather });
//       }
//     }

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

//     if (process.env.NODE_ENV !== 'production') {
//       console.log(`Uploaded: ${file.originalname} (${file.size} bytes)`);
//     }

//     const newPath = `${file.path}.mp3`;
//     fs.renameSync(file.path, newPath);

//     const transcription = await openai.audio.transcriptions.create({
//       file: fs.createReadStream(newPath),
//       model: 'whisper-1',
//     });

//     fs.unlinkSync(newPath);

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







const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// Detect weather request
const isWeatherRequest = (text) => /weather in ([a-zA-Z\s]+)/i.test(text);
const extractCity = (text) => text.match(/weather in ([a-zA-Z\s]+)/i)?.[1].trim();

// Detect sports score request
const isScoreRequest = (text) => /score.*\b([a-zA-Z\s]+)\b/i.test(text);
const extractTeamName = (text) => text.match(/score.*\b([a-zA-Z\s]+)\b/i)?.[1].trim();

const fetchWeather = async (city) => {
  try {
    const res = await axios.get(`https://open-weather13.p.rapidapi.com/city/${city}/EN`, {
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'open-weather13.p.rapidapi.com',
      },
    });
    const data = res.data;
    return `The weather in ${data.name} is ${data.weather[0].description} with a temperature of ${data.main.temp}°C.`;
  } catch (err) {
    console.error('Weather API error:', err?.response?.data || err.message);
    return `Sorry, I couldn't retrieve the weather for "${city}".`;
  }
};

const fetchScores = async (team) => {
  try {
    const res = await axios.get('https://therundown-therundown-v1.p.rapidapi.com/sports/2/events', {
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'therundown-therundown-v1.p.rapidapi.com',
      },
    });

    const games = res.data.events;
    const match = games.find((g) =>
      g.teams.some((t) => t.toLowerCase().includes(team.toLowerCase()))
    );

    if (!match) return `Sorry, I couldn't find a current or recent game for "${team}".`;

    const [home, away] = match.teams;
    const [scoreHome, scoreAway] = match.score || [];

    return `${home} vs. ${away} — Current Score: ${scoreHome}-${scoreAway}.`;
  } catch (err) {
    console.error('Score API error:', err?.response?.data || err.message);
    return `Sorry, I couldn't get the score for the ${team} game.`;
  }
};

// Main AI Endpoint
app.post('/api/generate', async (req, res) => {
  const { prompt } = req.body;

  try {
    if (isWeatherRequest(prompt)) {
      const city = extractCity(prompt);
      const result = await fetchWeather(city);
      return res.json({ result });
    }

    if (isScoreRequest(prompt)) {
      const team = extractTeamName(prompt);
      const result = await fetchScores(team);
      return res.json({ result });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    });

    res.json({ result: completion.choices[0].message.content });
  } catch (err) {
    console.error('AI response error:', err.message);
    res.status(500).json({ error: 'AI processing failed' });
  }
});

// Transcription Endpoint
app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No audio file uploaded' });

    const newPath = `${file.path}.mp3`;
    fs.renameSync(file.path, newPath);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(newPath),
      model: 'whisper-1',
    });

    fs.unlinkSync(newPath);
    res.json({ text: transcription.text });
  } catch (err) {
    const msg = err?.response?.data || err.message;
    console.error('Transcription error:', msg);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

