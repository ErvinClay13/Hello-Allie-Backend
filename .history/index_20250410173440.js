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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
app.use(express.json());

// ==========================
// Utility Functions
// ==========================
const isWeatherRequest = (text) => /weather in ([a-zA-Z\s]+)/i.test(text);
const extractCity = (text) => {
  const match = text.match(/weather in ([a-zA-Z\s]+)/i);
  return match ? match[1].trim() : null;
};

const isScoreRequest = (text) => /score.*(nba|basketball|bulls|lakers|knicks)/i.test(text);
const isScheduleRequest = (text) => /when.*(nba|basketball).*game/i.test(text);

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
    console.error('Weather API error:', error?.response?.data || error.message);
    return `Sorry, I couldn't retrieve the weather for "${city}".`;
  }
};

const getUpcomingGames = async (sportId = 4) => {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  try {
    const url = `https://therundown-therundown-v1.p.rapidapi.com/sports/${sportId}/events?date=${today}`;
    const response = await axios.get(url, {
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'therundown-therundown-v1.p.rapidapi.com',
      },
    });

    const events = response.data.events;
    if (!events || events.length === 0) return "No games scheduled today.";

    const topGames = events.slice(0, 3).map((event) => {
      const home = event.teams_normalized.find(t => t.is_home).name;
      const away = event.teams_normalized.find(t => !t.is_home).name;
      const time = event.event_time;

      return `${away} vs ${home} at ${time}`;
    });

    return `Here are some upcoming games today:\n${topGames.join("\n")}`;
  } catch (error) {
    console.error('Game schedule error:', error?.response?.data || error.message);
    return "Sorry, I couldn't retrieve the game schedule.";
  }
};

// ==========================
// AI Chat Endpoint
// ==========================
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;

    // Weather
    if (isWeatherRequest(prompt)) {
      const city = extractCity(prompt);
      if (city) {
        const weather = await fetchWeather(city);
        return res.json({ result: weather });
      }
    }

    // NBA Schedule
    if (isScheduleRequest(prompt)) {
      const schedule = await getUpcomingGames(4); // NBA sport_id = 4
      return res.json({ result: schedule });
    }

    // Default AI chat
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    });

    res.json({ result: completion.choices[0].message.content });
  } catch (error) {
    console.error('AI response error:', error.message);
    res.status(500).json({ error: 'Something went wrong with AI response' });
  }
});


const upload = multer({ dest: 'uploads/' });

app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`Uploaded: ${file.originalname} (${file.size} bytes)`);
    }

    const newPath = `${file.path}.mp3`;
    fs.renameSync(file.path, newPath);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(newPath),
      model: 'whisper-1',
    });

    fs.unlinkSync(newPath);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`Transcription successful: ${transcription.text}`);
    }

    res.json({ text: transcription.text });
  } catch (error) {
    const message = error?.response?.data || error.message;
    console.error('Whisper transcription error:', message);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

// ==========================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
