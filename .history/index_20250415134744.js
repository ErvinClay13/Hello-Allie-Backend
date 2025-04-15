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

// Dynamically detect team name and use sports search
const detectSportType = (text) => {
  const lower = text.toLowerCase();

  let type = null;
  if (lower.includes('score')) type = 'scores';
  else if (lower.includes('schedule') || lower.includes('next game') || lower.includes('when')) type = 'schedule';
  else if (lower.includes('summary') || lower.includes('recap')) type = 'summary';
  else if (lower.includes('odds') || lower.includes('betting')) type = 'odds';

  return type;
};

const fetchDynamicSportsData = async (teamName, type) => {
  const sportIds = [2, 3, 4]; // NFL, MLB, NBA
  const headers = {
    'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
    'X-RapidAPI-Host': 'therundown-therundown-v1.p.rapidapi.com',
  };
  const today = new Date().toISOString().split('T')[0];

  for (const sportId of sportIds) {
    try {
      const url = `https://therundown-therundown-v1.p.rapidapi.com/sports/${sportId}/events?date=${today}`;
      const res = await axios.get(url, { headers });
      const games = res.data.events || [];
      const match = games.find((game) => {
        return (
          game.teams?.home.toLowerCase().includes(teamName) ||
          game.teams?.away.toLowerCase().includes(teamName)
        );
      });

      if (!match) continue;

      if (type === 'scores') {
        return `${match.teams.away} ${match.score?.away ?? '?'} - ${match.teams.home} ${match.score?.home ?? '?'}`;
      } else if (type === 'schedule') {
        return `${match.teams.away} vs ${match.teams.home} — ${match.event_date}`;
      } else if (type === 'summary') {
        return `${match.teams.away} vs ${match.teams.home} — ${match.event_status}`;
      } else if (type === 'odds') {
        const oddsUrl = `https://therundown-therundown-v1.p.rapidapi.com/sports/${sportId}/odds`; // Optional
        const oddsRes = await axios.get(oddsUrl, { headers });
        const oddsGames = oddsRes.data.games || [];
        const oddsMatch = oddsGames.find((g) =>
          g.teams?.home.toLowerCase().includes(teamName) ||
          g.teams?.away.toLowerCase().includes(teamName)
        );
        if (oddsMatch && oddsMatch.odds) {
          return `${oddsMatch.teams.away} vs ${oddsMatch.teams.home} — Spread: ${oddsMatch.odds.spread}, Total: ${oddsMatch.odds.total}`;
        }
        return 'No odds found for that team.';
      }
    } catch (e) {
      console.error('Dynamic sports error:', e?.response?.data || e.message);
    }
  }
  return `Sorry, I couldn't find recent info for ${teamName}.`;
};

// AI chat + weather + sports
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

    const type = detectSportType(prompt);
    if (type) {
      const match = prompt.match(/(?:for|of|do|is|are|when|does|game|next|play) ([a-zA-Z\s]+)/i);
      const teamGuess = match ? match[1].toLowerCase().trim() : null;
      if (teamGuess) {
        const result = await fetchDynamicSportsData(teamGuess, type);
        return res.json({ result });
      }
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
