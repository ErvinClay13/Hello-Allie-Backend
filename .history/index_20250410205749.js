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







// BACKEND: index.js
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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// UTILS
const isWeatherRequest = (text) => /weather in ([a-zA-Z\s]+)/i.test(text);
const extractCity = (text) => {
  const match = text.match(/weather in ([a-zA-Z\s]+)/i);
  return match ? match[1].trim() : null;
};

const isSportsScheduleRequest = (text) => /when.*\b(play|next game)\b.*(\b[Nn][A-Za-z]+\b)/.test(text);
const isSportsSummaryRequest = (text) => /summary.*(\b[Nn][A-Za-z]+\b)/.test(text);
const extractTeam = (text) => {
  const match = text.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b/);
  return match ? match[1] : null;
};

const sportIDs = {
  NBA: 4,
  NFL: 2,
  MLB: 3,
  NHL: 6,
};

const fetchWeather = async (city) => {
  try {
    const response = await axios.get(`https://open-weather13.p.rapidapi.com/city/${city}/EN`, {
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'open-weather13.p.rapidapi.com',
      },
    });
    const data = response.data;
    return `The current weather in ${data.name}, ${data.sys.country} is ${data.weather[0].description} with a temperature of ${data.main.temp}°C.`;
  } catch (error) {
    return `Sorry, I couldn't retrieve the weather for "${city}".`;
  }
};

const fetchSchedule = async (team) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const sportList = Object.values(sportIDs);

    for (const sport of sportList) {
      const url = `https://therundown-therundown-v1.p.rapidapi.com/sports/${sport}/schedule?date=${today}`;
      const res = await axios.get(url, {
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'therundown-therundown-v1.p.rapidapi.com',
        },
      });

      const match = res.data.events.find(event =>
        event.teams.some(t => t.toLowerCase().includes(team.toLowerCase()))
      );

      if (match) {
        return `${match.teams[0]} vs ${match.teams[1]} at ${match.event_time}`;
      }
    }
    return `No upcoming game found for ${team}.`;
  } catch (error) {
    return `Failed to get schedule for ${team}`;
  }
};

const fetchSummary = async (team) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const sportList = Object.values(sportIDs);

    for (const sport of sportList) {
      const url = `https://therundown-therundown-v1.p.rapidapi.com/sports/${sport}/events?date=${today}`;
      const res = await axios.get(url, {
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'therundown-therundown-v1.p.rapidapi.com',
        },
      });

      const match = res.data.events.find(event =>
        event.teams.some(t => t.toLowerCase().includes(team.toLowerCase()))
      );

      if (match) {
        return `${match.teams[0]} played ${match.teams[1]} and the score was ${match.score}`;
      }
    }
    return `No recent summary found for ${team}.`;
  } catch (error) {
    return `Failed to get game summary for ${team}`;
  }
};

// AI Endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (isWeatherRequest(prompt)) {
      const city = extractCity(prompt);
      const result = await fetchWeather(city);
      return res.json({ result });
    }

    if (isSportsScheduleRequest(prompt)) {
      const team = extractTeam(prompt);
      const result = await fetchSchedule(team);
      return res.json({ result });
    }

    if (isSportsSummaryRequest(prompt)) {
      const team = extractTeam(prompt);
      const result = await fetchSummary(team);
      return res.json({ result });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    });

    res.json({ result: completion.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: 'AI response failed' });
  }
});

// Whisper
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
  } catch (error) {
    res.status(500).json({ error: 'Whisper failed' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));



