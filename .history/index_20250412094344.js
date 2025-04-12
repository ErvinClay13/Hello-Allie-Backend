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

// Weather logic
const fetchWeather = async (city) => {
  try {
    const response = await axios.get(
      `https://open-weather13.p.rapidapi.com/city/${city}/EN`,
      {
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'open-weather13.p.rapidapi.com',
        },
      }
    );

    const data = response.data;
    return `The current weather in ${data.name}, ${data.sys.country} is ${data.weather[0].description} with a temperature of ${data.main.temp}°C.`;
  } catch (error) {
    console.error('Weather API error:', error?.response?.data || error.message);
    return `Sorry, I couldn't retrieve the weather for "${city}".`;
  }
};

// Main AI handler with dynamic sports and weather
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;
    const lowerPrompt = prompt.toLowerCase();

    // Weather detection
    const weatherMatch = prompt.match(/weather in ([a-zA-Z\s]+)/i);
    if (weatherMatch && weatherMatch[1]) {
      const city = weatherMatch[1].trim();
      const weather = await fetchWeather(city);
      return res.json({ result: weather });
    }

    // Sports detection
    const isScore = /score|final|result/.test(lowerPrompt);
    const isSchedule = /schedule|when.*play|next game/.test(lowerPrompt);
    const isSummary = /summary|recap/.test(lowerPrompt);
    const isOdds = /odds|betting|line/.test(lowerPrompt);

    const knownTeams = {
      nba: ['lakers', 'bulls', 'knicks', 'warriors'],
      nfl: ['bears', 'jets', 'eagles', 'chiefs'],
      mlb: ['dodgers', 'yankees', 'mets', 'cubs'],
    };

    let team = null;
    let sportId = null;

    for (const [league, teams] of Object.entries(knownTeams)) {
      const match = teams.find((t) => lowerPrompt.includes(t));
      if (match) {
        team = match;
        sportId = league === 'nba' ? 4 : league === 'nfl' ? 2 : 3;
        break;
      }
    }

    if (sportId) {
      const date = new Date().toISOString().split('T')[0];

      if (isScore || isSummary) {
        const url = `https://therundown-therundown-v1.p.rapidapi.com/sports/${sportId}/scoreboard?date=${date}`;
        const data = await axios.get(url, {
          headers: {
            'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
            'X-RapidAPI-Host': 'therundown-therundown-v1.p.rapidapi.com',
          },
        });

        const event = data.data.events.find((e) =>
          e.teams.some((t) => t.name.toLowerCase().includes(team))
        );

        if (event) {
          const summary = `${event.teams[0].name} ${event.scores[0]} - ${event.teams[1].name} ${event.scores[1]}`;
          return res.json({ result: `Final score: ${summary}` });
        }

        return res.json({ result: `Sorry, I couldn't find a game for the ${team}` });
      }

      if (isSchedule) {
        const url = `https://therundown-therundown-v1.p.rapidapi.com/sports/${sportId}/schedule`;
        const data = await axios.get(url, {
          headers: {
            'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
            'X-RapidAPI-Host': 'therundown-therundown-v1.p.rapidapi.com',
          },
        });

        const event = data.data.events.find((e) =>
          e.teams.some((t) => t.name.toLowerCase().includes(team))
        );

        if (event) {
          const dateTime = new Date(event.event_date).toLocaleString();
          return res.json({ result: `Next game for the ${team} is on ${dateTime}.` });
        }

        return res.json({ result: `No upcoming games found for the ${team}.` });
      }

      if (isOdds) {
        const url = `https://therundown-therundown-v1.p.rapidapi.com/sports/${sportId}/odds`;
        const data = await axios.get(url, {
          headers: {
            'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
            'X-RapidAPI-Host': 'therundown-therundown-v1.p.rapidapi.com',
          },
        });

        const event = data.data.events.find((e) =>
          e.teams.some((t) => t.name.toLowerCase().includes(team))
        );

        if (event) {
          const line = event.odds?.spreads?.[0];
          return res.json({
            result: `Betting odds for ${team}: ${line?.team1} ${line?.spread1}, ${line?.team2} ${line?.spread2}`,
          });
        }

        return res.json({ result: `Could not find betting odds for ${team}` });
      }
    }

    // Default OpenAI fallback
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    });

    res.json({ result: completion.choices[0].message.content });
  } catch (error) {
    console.error('Smart AI Error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// Whisper transcription endpoint
const upload = multer({ dest: 'uploads/' });

app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

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
