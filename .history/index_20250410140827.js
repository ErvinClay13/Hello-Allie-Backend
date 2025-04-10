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

const SPORTS_API_KEY = process.env.RAPIDAPI_KEY;

// --- WEATHER ---
const fetchWeather = async (city) => {
  try {
    const response = await axios.get(`https://open-weather13.p.rapidapi.com/city/${city}/EN`, {
      headers: {
        'X-RapidAPI-Key': SPORTS_API_KEY,
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

// --- SPORTS HELPERS ---
const getTeamScore = async (team) => {
  try {
    const res = await axios.get('https://therundown-therundown-v1.p.rapidapi.com/sports/4/events', {
      headers: {
        'X-RapidAPI-Key': SPORTS_API_KEY,
        'X-RapidAPI-Host': 'therundown-therundown-v1.p.rapidapi.com',
      },
    });

    const events = res.data.events;
    const match = events.find(e =>
      e.teams.some(t => t.toLowerCase().includes(team.toLowerCase()))
    );

    if (match) {
      return `${match.teams[0]} ${match.scores[0]} - ${match.teams[1]} ${match.scores[1]} (Status: ${match.event_status})`;
    }

    return `Sorry, I couldn’t find a recent score for the ${team}.`;
  } catch (error) {
    console.error('Score API error:', error.message);
    return `Error getting the score for ${team}.`;
  }
};

const getUpcomingGame = async (team) => {
  try {
    const res = await axios.get('https://therundown-therundown-v1.p.rapidapi.com/sports/4/events/upcoming', {
      headers: {
        'X-RapidAPI-Key': SPORTS_API_KEY,
        'X-RapidAPI-Host': 'therundown-therundown-v1.p.rapidapi.com',
      },
    });

    const game = res.data.events.find(e =>
      e.teams.some(t => t.toLowerCase().includes(team.toLowerCase()))
    );

    if (game) {
      return `${game.teams[0]} vs ${game.teams[1]} on ${game.event_date} at ${game.event_time}`;
    }

    return `No upcoming games found for the ${team}.`;
  } catch (error) {
    console.error('Upcoming game API error:', error.message);
    return `Could not retrieve upcoming games for the ${team}.`;
  }
};

const getBettingOdds = async (team) => {
  try {
    const res = await axios.get('https://therundown-therundown-v1.p.rapidapi.com/sports/4/events', {
      headers: {
        'X-RapidAPI-Key': SPORTS_API_KEY,
        'X-RapidAPI-Host': 'therundown-therundown-v1.p.rapidapi.com',
      },
    });

    const game = res.data.events.find(e =>
      e.teams.some(t => t.toLowerCase().includes(team.toLowerCase()))
    );

    if (game && game.odds && game.odds.spreads) {
      const spread = game.odds.spreads[0];
      return `Betting odds for ${team}: ${spread.teams[0]} ${spread.points[0]}, ${spread.teams[1]} ${spread.points[1]}`;
    }

    return `No betting odds found for the ${team}.`;
  } catch (error) {
    console.error('Betting odds API error:', error.message);
    return `Could not get betting odds for the ${team}.`;
  }
};

// --- AI CHAT HANDLER ---
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;

    // Weather check
    if (/weather in ([a-zA-Z\s]+)/i.test(prompt)) {
      const city = prompt.match(/weather in ([a-zA-Z\s]+)/i)[1].trim();
      const weather = await fetchWeather(city);
      return res.json({ result: weather });
    }

    // Score check
    if (/score.*\b([a-zA-Z\s]+)\b/i.test(prompt)) {
      const team = prompt.match(/score.*\b([a-zA-Z\s]+)\b/i)[1].trim();
      const score = await getTeamScore(team);
      return res.json({ result: score });
    }

    // Upcoming games
    if (/when.*\b([a-zA-Z\s]+)\b.*play next/i.test(prompt)) {
      const team = prompt.match(/when.*\b([a-zA-Z\s]+)\b.*play next/i)[1].trim();
      const game = await getUpcomingGame(team);
      return res.json({ result: game });
    }

    // Odds
    if (/odds.*\b([a-zA-Z\s]+)\b/i.test(prompt)) {
      const team = prompt.match(/odds.*\b([a-zA-Z\s]+)\b/i)[1].trim();
      const odds = await getBettingOdds(team);
      return res.json({ result: odds });
    }

    // Fallback to OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    });

    res.json({ result: completion.choices[0].message.content });
  } catch (error) {
    console.error('AI handler error:', error.message);
    res.status(500).json({ error: 'AI request failed' });
  }
});

// --- AUDIO TRANSCRIPTION ---
const upload = multer({ dest: 'uploads/' });

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
    const message = error?.response?.data || error.message;
    console.error('Whisper transcription error:', message);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
