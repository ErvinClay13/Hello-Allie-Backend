const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { OpenAI } = require("openai");
const multer = require("multer");
const fs = require("fs");
const axios = require("axios");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json());

// Util: Weather Check
const isWeatherRequest = (text) => /weather in ([a-zA-Z\s]+)/i.test(text);
const extractCity = (text) => {
  const match = text.match(/weather in ([a-zA-Z\s]+)/i);
  return match ? match[1].trim() : null;
};

// Util: Sports Check
const isSportsQuestion = (text) =>
  /score|next game|schedule|odds|betting|when do the|game summary|who.*play/i.test(text);

const extractTeamFromPrompt = (text) => {
  const knownTeams = [
    "bulls", "lakers", "knicks", "warriors",
    "bears", "jets", "eagles",
    "yankees", "dodgers", "cubs", "heat", "mavericks"
  ];
  const lowered = text.toLowerCase();
  return knownTeams.find((team) => lowered.includes(team)) || null;
};

const teamSportMap = {
  bulls: 4, lakers: 4, knicks: 4, warriors: 4, // NBA
  bears: 2, jets: 2, eagles: 2,                // NFL
  yankees: 3, dodgers: 3, cubs: 3              // MLB
};

const fetchWeather = async (city) => {
  try {
    const response = await axios.get(`https://open-weather13.p.rapidapi.com/city/${city}/EN`, {
      headers: {
        "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "open-weather13.p.rapidapi.com"
      },
    });
    const data = response.data;
    return `The current weather in ${data.name}, ${data.sys.country} is ${data.weather[0].description} with a temperature of ${data.main.temp}°C.`;
  } catch (error) {
    console.error("Weather API error:", error?.response?.data || error.message);
    return `Sorry, I couldn't retrieve the weather for "${city}".`;
  }
};

const handleSportsQuery = async (text) => {
  const team = extractTeamFromPrompt(text);
  if (!team) return "Sorry, I couldn't find recent info for that team.";

  const sportId = teamSportMap[team];
  if (!sportId) return "Sorry, I couldn't find sport data for that team.";

  const today = new Date().toISOString().split("T")[0];

  try {
    const response = await axios.get(`https://therundown-therundown-v1.p.rapidapi.com/sports/${sportId}/events`, {
      headers: {
        "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "therundown-therundown-v1.p.rapidapi.com"
      },
      params: { date: today }
    });

    const games = response.data.events;
    const game = games.find(g =>
      g.teams && g.teams.some(t => t.toLowerCase().includes(team))
    );

    if (!game) return `No recent or upcoming games found for the ${team}.`;

    const home = game.teams[0];
    const away = game.teams[1];
    const time = game.event_time;
    const status = game.event_status;

    return `The ${away} will play the ${home} on ${time}. Status: ${status}.`;
  } catch (err) {
    console.error("Score API error:", err?.response?.data || err.message);
    return "Sorry, something went wrong getting sports info.";
  }
};

// Smart endpoint for weather/sports/AI
app.post("/api/smart", async (req, res) => {
  const { prompt } = req.body;

  try {
    if (isWeatherRequest(prompt)) {
      const city = extractCity(prompt);
      if (city) {
        const weather = await fetchWeather(city);
        return res.json({ result: weather });
      }
    }

    if (isSportsQuestion(prompt)) {
      const result = await handleSportsQuery(prompt);
      return res.json({ result });
    }

    // fallback to AI
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
    });

    res.json({ result: completion.choices[0].message.content });
  } catch (error) {
    console.error("Smart API error:", error.message || error);
    res.status(500).json({ error: "Smart AI failed" });
  }
});

// Transcription Endpoint
const upload = multer({ dest: "uploads/" });

app.post("/api/transcribe", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No audio file uploaded" });

    const newPath = `${file.path}.mp3`;
    fs.renameSync(file.path, newPath);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(newPath),
      model: "whisper-1",
    });

    fs.unlinkSync(newPath);
    res.json({ text: transcription.text });
  } catch (error) {
    const message = error?.response?.data || error.message;
    console.error("Whisper transcription error:", message);
    res.status(500).json({ error: "Failed to transcribe audio" });
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
