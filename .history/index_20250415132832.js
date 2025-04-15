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

// Sports detection helpers
const sportsTeams = {
  nba: 4,
  nfl: 2,
  mlb: 3,
  bulls: 4,
  lakers: 4,
  knicks: 4,
  warriors: 4,
  bears: 2,
  jets: 2,
  eagles: 2,
  yankees: 3,
  dodgers: 3,
};

const extractTeamAndType = (text) => {
  const lower = text.toLowerCase();
  let type = null;
  let teamKey = null;

  if (lower.includes('score')) type = 'scores';
  else if (lower.includes('schedule') || lower.includes('play next')) type = 'schedule';
  else if (lower.includes('summary')) type = 'summary';
  else if (lower.includes('odds') || lower.includes('betting')) type = 'odds';

  for (const key in sportsTeams) {
    if (lower.includes(key)) {
      teamKey = key;
      break;
    }
  }

  return { teamKey, type };
};

const fetchSportsData = async (teamKey, type) => {
  const sportId = sportsTeams[teamKey];
  const baseUrl = 'https://therundown-therundown-v1.p.rapidapi.com/sports';
  const today = new Date().toISOString().split('T')[0];

  const headers = {
    'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
    'X-RapidAPI-Host': 'therundown-therundown-v1.p.rapidapi.com',
  };

  try {
    if (type === 'scores' || type === 'summary' || type === 'schedule') {
      const url = `${baseUrl}/${sportId}/events`; // fixed endpoint
      const res = await axios.get(url, { headers });
      const games = res.data.events || [];

      const teamGame = games.find((game) => {
        return (
          game.teams &&
          (game.teams.away.toLowerCase().includes(teamKey) ||
            game.teams.home.toLowerCase().includes(teamKey))
        );
      });

      if (!teamGame) return `No game found for ${teamKey}.`;

      if (type === 'scores') {
        return `${teamGame.teams.away} ${teamGame.score?.away ?? '?'} - ${teamGame.teams.home} ${teamGame.score?.home ?? '?'}`;
      }

      if (type === 'summary') {
        return `${teamGame.teams.away} vs ${teamGame.teams.home} — ${teamGame.event_status} on ${teamGame.event_date}`;
      }

      if (type === 'schedule') {
        return `${teamGame.teams.away} vs ${teamGame.teams.home} at ${teamGame.event_date}`;
      }
    } else if (type === 'odds') {
      const url = `${baseUrl}/${sportId}/odds`;
      const res = await axios.get(url, { headers });
      const games = res.data.games || [];
      const teamGame = games.find((game) => {
        return (
          game.teams &&
          (game.teams.away.toLowerCase().includes(teamKey) ||
            game.teams.home.toLowerCase().includes(teamKey))
        );
      });
      if (!teamGame) return `No odds found for ${teamKey}.`;
      return `${teamGame.teams.away} vs ${teamGame.teams.home} — spread: ${teamGame.odds.spread}, total: ${teamGame.odds.total}`;
    }

    return 'Sorry, I could not get the requested sports info.';
  } catch (error) {
    console.error('Score API error:', error?.response?.data || error.message);
    return 'Sorry, something went wrong getting sports info.';
  }
};

// Detect if it's weather or sports before fallback AI
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;

    const weatherMatch = prompt.match(/weather in ([a-zA-Z\s]+)/i);
    if (weatherMatch && weatherMatch[1]) {
      const city = weatherMatch[1].trim();
      const response = await axios.post(
        'https://hello-allie-backend.onrender.com/api/weather',
        { city },
        { headers: { 'Content-Type': 'application/json' } }
      );
      return res.json({ result: response.data.result });
    }

    const { teamKey, type } = extractTeamAndType(prompt);
    if (teamKey && type) {
      const sportsResult = await fetchSportsData(teamKey, type);
      return res.json({ result: sportsResult });
    }

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

// Whisper endpoint
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

// Weather proxy endpoint
app.post('/api/weather', async (req, res) => {
  try {
    const { city } = req.body;
    const weatherUrl = `https://open-weather13.p.rapidapi.com/city/${city}/EN`;
    const headers = {
      'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'open-weather13.p.rapidapi.com',
    };
    const response = await axios.get(weatherUrl, { headers });
    const data = response.data;
    const weather = `The current weather in ${data.name}, ${data.sys.country} is ${data.weather[0].description} with a temperature of ${data.main.temp}°C.`;
    res.json({ result: weather });
  } catch (error) {
    console.error('Weather API error:', error?.response?.data || error.message);
    res.status(500).json({ result: `Sorry, I couldn't retrieve the weather.` });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});






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
