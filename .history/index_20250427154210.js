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

// --- Weather API Functions ---
const isWeatherRequest = (text) =>
  /(weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i.test(text);

const extractCity = (text) => {
  const match = text.match(/(?:weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i);
  return match ? match[1].trim() : null;
};

const fetchWeather = async (city) => {
  try {
    const formattedCity = city.replace(/,/g, "").split(" ")[0];
    const url = `https://open-weather13.p.rapidapi.com/city/${formattedCity}/US?units=imperial`;

    const response = await axios.get(url, {
      headers: {
        "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "open-weather13.p.rapidapi.com",
      },
    });

    const data = response.data;

    if (!data.main || !data.weather || !data.sys || !data.wind) {
      throw new Error("Incomplete weather data");
    }

    const tempF = data.main.temp;
    const humidity = data.main.humidity;
    const windSpeedMph = data.wind.speed;

    return `The current weather in ${data.name}, ${data.sys.country} is ${data.weather[0].description} with a temperature of ${tempF.toFixed(1)}°F, humidity of ${humidity}% and wind speed of ${windSpeedMph.toFixed(1)} mph.`;
  } catch (error) {
    console.error("❌ Weather API error:", error);
    return `Sorry, I couldn't retrieve the weather for "${city}".`;
  }
};

// --- Name Query Detection ---
const isNameQuery = (text) =>
  /what('| i)?s your name|who are you|tell me about yourself/i.test(text);

// --- Dad Joke API ---
const isDadJokeRequest = (text) =>
  /(tell me a joke|dad joke|make me laugh|joke|say something funny)/i.test(text);

const fetchDadJoke = async () => {
  try {
    const options = {
      method: "GET",
      url: "https://dad-jokes-by-api-ninjas.p.rapidapi.com/v1/dadjokes",
      headers: {
        "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "dad-jokes-by-api-ninjas.p.rapidapi.com",
      },
    };

    const response = await axios.request(options);
    if (response.data && response.data.length > 0) {
      return response.data[0].joke;
    } else {
      return "Couldn't find a dad joke right now, sorry!";
    }
  } catch (error) {
    console.error("❌ Dad Joke API error:", error);
    return "Failed to fetch a dad joke.";
  }
};

// --- NBA Schedule API ---
const isNBAScheduleRequest = (text) => {
  const lower = text.toLowerCase();
  return (
    lower.includes("nba schedule") ||
    lower.includes("nba games") ||
    lower.includes("nba games scores") ||
    lower.includes("what are the nba scores") ||
    lower.includes("nba scores right now") ||
    lower.includes("what are the nba scores right now") ||
    lower.includes("what are the nba scores from last night") ||
    lower.includes("nba") && lower.includes("yesterday")) ||
    (lower.includes("nba") && lower.includes("scores")) ||
    (lower.includes("nba") && lower.includes("games")) ||
    lower.includes("nba scores") ||
    lower.includes("nba yesterday") ||
    lower.includes("nba today") ||
  );
};

const isYesterdayNBARequest = (text) => {
  return /yesterday/i.test(text);
};

const fetchNBASchedule = async (date) => {
  try {
    const options = {
      method: "GET",
      url: "https://nba-api-free-data.p.rapidapi.com/nba-schedule-by-date",
      params: { date },
      headers: {
        "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "nba-api-free-data.p.rapidapi.com",
      },
    };

    const response = await axios.request(options);

    const events = response.data?.response?.Events || [];

    if (events.length === 0) {
      return `No NBA games found for that date.`;
    }

    const gameSummaries = events.map((event) => {
      const homeTeam = event.competitors.find((c) => c.isHome)?.shortDisplayName || "Home Team";
      const awayTeam = event.competitors.find((c) => !c.isHome)?.shortDisplayName || "Away Team";
      const homeScore = event.competitors.find((c) => c.isHome)?.score ?? "0";
      const awayScore = event.competitors.find((c) => !c.isHome)?.score ?? "0";
      const status = event.status?.detail || "Scheduled";

      return `${awayTeam} (${awayScore}) vs ${homeTeam} (${homeScore}) - ${status}`;
    }).join("\n");

    return gameSummaries;
  } catch (error) {
    console.error("❌ NBA API error:", error);
    return "Failed to fetch NBA schedule.";
  }
};

// --- SMART AI MAIN ENDPOINT ---
app.post("/api/smart", async (req, res) => {
  const { prompt, conversationHistory = [] } = req.body;
  try {
    if (isWeatherRequest(prompt)) {
      const city = extractCity(prompt);
      if (city) {
        const result = await fetchWeather(city);
        return res.json({ result });
      }
    }

    if (isNameQuery(prompt)) {
      return res.json({
        result: "My name is Allie, short for Artificial Language Learning & Interaction Engine. I’m here to help you with whatever you need!",
      });
    }

    if (isDadJokeRequest(prompt)) {
      const joke = await fetchDadJoke();
      return res.json({ result: joke });
    }

    if (isNBAScheduleRequest(prompt)) {
      const today = new Date();
      const easternToday = new Date(today.toLocaleString("en-US", { timeZone: "America/New_York" }));

      let nbaDate = easternToday;
      if (isYesterdayNBARequest(prompt)) {
        nbaDate = new Date(easternToday);
        nbaDate.setDate(easternToday.getDate() - 1);
      }

      const dateStr = `${nbaDate.getFullYear()}${(nbaDate.getMonth() + 1).toString().padStart(2, "0")}${nbaDate.getDate().toString().padStart(2, "0")}`;
      const readableDate = nbaDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

      const games = await fetchNBASchedule(dateStr);
      return res.json({ result: `NBA games for ${readableDate}:\n${games}` });
    }

    const messages = conversationHistory.map(entry => ({
      role: entry.role,
      content: entry.content
    }));

    messages.push({ role: "user", content: prompt });

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
    });

    res.json({ result: completion.choices[0].message.content.trim() });
  } catch (error) {
    console.error("Smart AI Error:", error.message || error);
    res.status(500).json({ error: "Smart AI failed" });
  }
});

// --- Transcription Endpoint (Whisper AI) ---
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

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});











// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { OpenAI } = require("openai");
// const multer = require("multer");
// const fs = require("fs");
// const axios = require("axios");

// dotenv.config();
// const app = express();
// const PORT = process.env.PORT || 5000;

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// app.use(cors());
// app.use(express.json());

// // --- Weather API Functions ---
// const isWeatherRequest = (text) =>
//   /(weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i.test(
//     text
//   );

// const extractCity = (text) => {
//   const match = text.match(
//     /(?:weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i
//   );
//   return match ? match[1].trim() : null;
// };

// const fetchWeather = async (city) => {
//   try {
//     const formattedCity = city.replace(/,/g, "").split(" ")[0];
//     const url = `https://open-weather13.p.rapidapi.com/city/${formattedCity}/US?units=imperial`;
//     console.log("🔍 Weather API URL:", url);

//     const response = await axios.get(url, {
//       headers: {
//         "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
//         "X-RapidAPI-Host": "open-weather13.p.rapidapi.com",
//       },
//     });

//     const data = response.data;
//     console.log("📦 Weather API Response:", data);

//     if (!data.main || !data.weather || !data.sys || !data.wind) {
//       throw new Error("Incomplete weather data");
//     }

//     const tempF = data.main.temp;
//     const humidity = data.main.humidity;
//     const windSpeedMph = data.wind.speed;

//     return `The current weather in ${data.name}, ${data.sys.country} is ${
//       data.weather[0].description
//     } with a temperature of ${tempF.toFixed(
//       1
//     )}°F, humidity of ${humidity}% and wind speed of ${windSpeedMph.toFixed(
//       1
//     )} mph.`;
//   } catch (error) {
//     console.error("❌ Weather API error:", error);
//     return `Sorry, I couldn't retrieve the weather for "${city}".`;
//   }
// };

// // --- Name Query Detection ---
// const isNameQuery = (text) =>
//   /what('| i)?s your name|who are you|tell me about yourself/i.test(text);

// // --- Dad Joke API ---
// const isDadJokeRequest = (text) =>
//   /(tell me a joke|dad joke|make me laugh|joke|say something funny)/i.test(
//     text
//   );

// const fetchDadJoke = async () => {
//   try {
//     const options = {
//       method: "GET",
//       url: "https://dad-jokes-by-api-ninjas.p.rapidapi.com/v1/dadjokes",
//       headers: {
//         "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
//         "X-RapidAPI-Host": "dad-jokes-by-api-ninjas.p.rapidapi.com",
//       },
//     };

//     const response = await axios.request(options);
//     if (response.data && response.data.length > 0) {
//       return response.data[0].joke;
//     } else {
//       return "Couldn't find a dad joke right now, sorry!";
//     }
//   } catch (error) {
//     console.error("❌ Dad Joke API error:", error);
//     return "Failed to fetch a dad joke.";
//   }
// };

// // --- NBA Schedule API  ---
// const isNBAScheduleRequest = (text) => {
//   const lower = text.toLowerCase();
//   return (
//     lower.includes("nba schedule") ||
//     lower.includes("nba games") ||
//     lower.includes("nba games scores") ||
//     lower.includes("what are the nba scores") ||
//     lower.includes("nba scores right now") ||
//     lower.includes("what are the nba scores right now") ||
//     lower.includes("what are the nba scores from last night") ||
//     lower.includes("nba scores") ||
//     lower.includes("nba today")
//   );
// };

// const fetchNBASchedule = async (date) => {
//   try {
//     const options = {
//       method: "GET",
//       url: "https://nba-api-free-data.p.rapidapi.com/nba-schedule-by-date",
//       params: { date },
//       headers: {
//         "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
//         "X-RapidAPI-Host": "nba-api-free-data.p.rapidapi.com",
//       },
//     };

//     const response = await axios.request(options);

//     const events = response.data?.response?.Events || [];

//     if (events.length === 0) {
//       return `No NBA games found for that date.`;
//     }

//     const gameSummaries = events
//       .map((event) => {
//         const homeTeam =
//           event.competitors.find((c) => c.isHome)?.shortDisplayName ||
//           "Home Team";
//         const awayTeam =
//           event.competitors.find((c) => !c.isHome)?.shortDisplayName ||
//           "Away Team";
//         const homeScore = event.competitors.find((c) => c.isHome)?.score ?? "0";
//         const awayScore =
//           event.competitors.find((c) => !c.isHome)?.score ?? "0";
//         const status = event.status?.detail || "Scheduled";

//         return `${awayTeam} (${awayScore}) vs ${homeTeam} (${homeScore}) - ${status}`;
//       })
//       .join("\n");

//     return `NBA games for ${date}:\n${gameSummaries}`;
//   } catch (error) {
//     console.error("❌ NBA API error:", error);
//     return "Failed to fetch NBA schedule.";
//   }
// };

// // --- SMART AI MAIN ENDPOINT ---
// app.post("/api/smart", async (req, res) => {
//   const { prompt, conversationHistory = [] } = req.body;
//   try {
//     if (isWeatherRequest(prompt)) {
//       const city = extractCity(prompt);
//       if (city) {
//         const result = await fetchWeather(city);
//         return res.json({ result });
//       }
//     }

//     if (isNameQuery(prompt)) {
//       return res.json({
//         result:
//           "My name is Allie, short for Artificial Language Learning & Interaction Engine. I’m here to help you with whatever you need!",
//       });
//     }

//     if (isDadJokeRequest(prompt)) {
//       const joke = await fetchDadJoke();
//       return res.json({ result: joke });
//     }

//     if (isNBAScheduleRequest(prompt)) {
//       const today = new Date();
//       const dateStr = `${today.getFullYear()}${(today.getMonth() + 1)
//         .toString()
//         .padStart(2, "0")}${today.getDate().toString().padStart(2, "0")}`;

//       const games = await fetchNBASchedule(dateStr);
//       return res.json({ result: games });
//     }

//     const messages = [];

//     conversationHistory.forEach(entry => {
//       messages.push({ role: entry.role, content: entry.content });
//     });

//     messages.push({ role: "user", content: prompt });

//     const completion = await openai.chat.completions.create({
//       model: "gpt-4",
//       messages,
//     });

//     res.json({ result: completion.choices[0].message.content.trim() });
//   } catch (error) {
//     console.error("Smart AI Error:", error.message || error);
//     res.status(500).json({ error: "Smart AI failed" });
//   }
// });

// // --- Transcription Endpoint (Whisper AI) ---
// const upload = multer({ dest: "uploads/" });

// app.post("/api/transcribe", upload.single("file"), async (req, res) => {
//   try {
//     const file = req.file;
//     if (!file) return res.status(400).json({ error: "No audio file uploaded" });

//     const newPath = `${file.path}.mp3`;
//     fs.renameSync(file.path, newPath);

//     const transcription = await openai.audio.transcriptions.create({
//       file: fs.createReadStream(newPath),
//       model: "whisper-1",
//     });

//     fs.unlinkSync(newPath);
//     res.json({ text: transcription.text });
//   } catch (error) {
//     const message = error?.response?.data || error.message;
//     console.error("Whisper transcription error:", message);
//     res.status(500).json({ error: "Failed to transcribe audio" });
//   }
// });

// // --- Server Start ---
// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });













// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { OpenAI } = require("openai");
// const multer = require("multer");
// const fs = require("fs");
// const axios = require("axios");

// dotenv.config();
// const app = express();
// const PORT = process.env.PORT || 5000;

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// app.use(cors());
// app.use(express.json());

// // --- Weather API Functions ---
// const isWeatherRequest = (text) =>
//   /(weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i.test(
//     text
//   );

// const extractCity = (text) => {
//   const match = text.match(
//     /(?:weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i
//   );
//   return match ? match[1].trim() : null;
// };

// const fetchWeather = async (city) => {
//   try {
//     const formattedCity = city.replace(/,/g, "").split(" ")[0];
//     const url = `https://open-weather13.p.rapidapi.com/city/${formattedCity}/US?units=imperial`;
//     console.log("🔍 Weather API URL:", url);

//     const response = await fetch(url, {
//       headers: {
//         "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
//         "X-RapidAPI-Host": "open-weather13.p.rapidapi.com",
//       },
//     });

//     const data = await response.json();
//     console.log("📦 Weather API Response:", data);

//     if (!data.main || !data.weather || !data.sys || !data.wind) {
//       throw new Error("Incomplete weather data");
//     }

//     const tempF = data.main.temp;
//     const humidity = data.main.humidity;
//     const windSpeedMph = data.wind.speed;

//     return `The current weather in ${data.name}, ${data.sys.country} is ${
//       data.weather[0].description
//     } with a temperature of ${tempF.toFixed(
//       1
//     )}°F, humidity of ${humidity}% and wind speed of ${windSpeedMph.toFixed(
//       1
//     )} mph.`;
//   } catch (error) {
//     console.error("❌ Weather API error:", error);
//     return `Sorry, I couldn't retrieve the weather for "${city}".`;
//   }
// };

// // --- Name Query Detection ---
// const isNameQuery = (text) =>
//   /what('| i)?s your name|who are you|tell me about yourself/i.test(text);

// // --- Dad Joke API ---
// const isDadJokeRequest = (text) =>
//   /(tell me a joke|dad joke|make me laugh|joke|say something funny)/i.test(
//     text
//   );

// const fetchDadJoke = async () => {
//   try {
//     const options = {
//       method: "GET",
//       url: "https://dad-jokes-by-api-ninjas.p.rapidapi.com/v1/dadjokes",
//       headers: {
//         "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
//         "X-RapidAPI-Host": "dad-jokes-by-api-ninjas.p.rapidapi.com",
//       },
//     };

//     const response = await axios.request(options);
//     if (response.data && response.data.length > 0) {
//       return response.data[0].joke;
//     } else {
//       return "Couldn't find a dad joke right now, sorry!";
//     }
//   } catch (error) {
//     console.error("❌ Dad Joke API error:", error);
//     return "Failed to fetch a dad joke.";
//   }
// };

// // --- NBA Schedule API  ---
// const isNBAScheduleRequest = (text) => {
//   const lower = text.toLowerCase();
//   return (
//     lower.includes("nba schedule") ||
//     lower.includes("nba games") ||
//     lower.includes("nba games scores") ||
//     lower.includes("what are the nba scores") ||
//     lower.includes("nba scores right now") ||
//     lower.includes("what are the nba scores right now") ||
//     lower.includes("what are the nba scores from last night") ||
//     lower.includes("nba scores") ||
//     lower.includes("nba today")
//   );
// };

// const fetchNBASchedule = async (date) => {
//   try {
//     const options = {
//       method: "GET",
//       url: "https://nba-api-free-data.p.rapidapi.com/nba-schedule-by-date",
//       params: { date },
//       headers: {
//         "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
//         "X-RapidAPI-Host": "nba-api-free-data.p.rapidapi.com",
//       },
//     };

//     const response = await axios.request(options);

//     const events = response.data?.response?.Events || [];

//     if (events.length === 0) {
//       return `No NBA games found for that date.`;
//     }

//     const gameSummaries = events
//       .map((event) => {
//         const homeTeam =
//           event.competitors.find((c) => c.isHome)?.shortDisplayName ||
//           "Home Team";
//         const awayTeam =
//           event.competitors.find((c) => !c.isHome)?.shortDisplayName ||
//           "Away Team";
//         const homeScore = event.competitors.find((c) => c.isHome)?.score ?? "0";
//         const awayScore =
//           event.competitors.find((c) => !c.isHome)?.score ?? "0";
//         const status = event.status?.detail || "Scheduled";

//         return `${awayTeam} (${awayScore}) vs ${homeTeam} (${homeScore}) - ${status}`;
//       })
//       .join("\n");

//     return `NBA games for ${date}:\n${gameSummaries}`;
//   } catch (error) {
//     console.error("❌ NBA API error:", error);
//     return "Failed to fetch NBA schedule.";
//   }
// };

// // --- SMART AI MAIN ENDPOINT ---
// app.post("/api/smart", async (req, res) => {
//   const { prompt } = req.body;
//   try {
//     if (isWeatherRequest(prompt)) {
//       const city = extractCity(prompt);
//       if (city) {
//         const result = await fetchWeather(city);
//         return res.json({ result });
//       }
//     }

//     if (isNameQuery(prompt)) {
//       return res.json({
//         result:
//           "My name is Allie, short for Artificial Language Learning & Interaction Engine. I’m here to help you with whatever you need!",
//       });
//     }

//     if (isDadJokeRequest(prompt)) {
//       const joke = await fetchDadJoke();
//       return res.json({ result: joke });
//     }

//     if (isNBAScheduleRequest(prompt)) {
//       const today = new Date();
//       const dateStr = `${today.getFullYear()}${(today.getMonth() + 1)
//         .toString()
//         .padStart(2, "0")}${today.getDate().toString().padStart(2, "0")}`;

//       const games = await fetchNBASchedule(dateStr);
//       return res.json({ result: games });
//     }

//     // Default: use OpenAI GPT-4
//     const completion = await openai.chat.completions.create({
//       model: "gpt-4",
//       messages: [{ role: "user", content: prompt }],
//     });

//     res.json({ result: completion.choices[0].message.content });
//   } catch (error) {
//     console.error("Smart AI Error:", error.message || error);
//     res.status(500).json({ error: "Smart AI failed" });
//   }
// });

// // --- Transcription Endpoint (Whisper AI) ---
// const upload = multer({ dest: "uploads/" });

// app.post("/api/transcribe", upload.single("file"), async (req, res) => {
//   try {
//     const file = req.file;
//     if (!file) return res.status(400).json({ error: "No audio file uploaded" });

//     const newPath = `${file.path}.mp3`;
//     fs.renameSync(file.path, newPath);

//     const transcription = await openai.audio.transcriptions.create({
//       file: fs.createReadStream(newPath),
//       model: "whisper-1",
//     });

//     fs.unlinkSync(newPath);
//     res.json({ text: transcription.text });
//   } catch (error) {
//     const message = error?.response?.data || error.message;
//     console.error("Whisper transcription error:", message);
//     res.status(500).json({ error: "Failed to transcribe audio" });
//   }
// });

// // --- Server Start ---
// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });
















// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { OpenAI } = require("openai");
// const multer = require("multer");
// const fs = require("fs");
// const axios = require("axios"); // ✅ ADD axios for Dad Jokes API

// dotenv.config();
// const app = express();
// const PORT = process.env.PORT || 5000;

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// app.use(cors());
// app.use(express.json());

// // --- Dad Jokes API function ---
// const fetchDadJoke = async () => {
//   try {
//     const options = {
//       method: 'GET',
//       url: 'https://dad-jokes-by-api-ninjas.p.rapidapi.com/v1/dadjokes',
//       headers: {
//         'X-RapidAPI-Key': process.env.RAPIDAPI_KEY, // ✅ uses your environment variable
//         'X-RapidAPI-Host': 'dad-jokes-by-api-ninjas.p.rapidapi.com'
//       }
//     };

//     const response = await axios.request(options);
//     if (response.data && response.data.length > 0) {
//       return response.data[0].joke; // Assuming API returns array with joke inside
//     } else {
//       return "Couldn't find a dad joke right now, sorry!";
//     }
//   } catch (error) {
//     console.error("❌ Dad Joke API error:", error);
//     return "Failed to fetch a dad joke.";
//   }
// };

// // --- Weather Functions ---
// const isWeatherRequest = (text) =>
//   /(weather|temperature|degrees) in ([a-zA-Z\s,]+)/i.test(text);

// const extractCity = (text) => {
//   const match = text.match(/(?:weather|temperature|degrees) in ([a-zA-Z\s,]+)/i);
//   return match ? match[1].trim() : null;
// };

// const fetchWeather = async (city) => {
//   try {
//     const formattedCity = city.replace(/,/g, "").split(" ")[0];
//     const url = `https://open-weather13.p.rapidapi.com/city/${formattedCity}/US?units=imperial`;
//     console.log("🔍 Weather API URL:", url);

//     const response = await fetch(url, {
//       headers: {
//         "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
//         "X-RapidAPI-Host": "open-weather13.p.rapidapi.com",
//       },
//     });

//     const data = await response.json();
//     console.log("📦 Weather API Response:", data);

//     if (!data.main || !data.weather || !data.sys || !data.wind) {
//       throw new Error("Incomplete weather data");
//     }

//     const tempF = data.main.temp;
//     const humidity = data.main.humidity;
//     const windSpeedMph = data.wind.speed;

//     return `The current weather in ${data.name}, ${data.sys.country} is ${data.weather[0].description} with a temperature of ${tempF.toFixed(1)}°F, humidity of ${humidity}% and wind speed of ${windSpeedMph.toFixed(1)} mph.`;
//   } catch (error) {
//     console.error("❌ Weather API error:", error);
//     return `Sorry, I couldn't retrieve the weather for "${city}".`;
//   }
// };

// // --- Name Recognition ---
// const isNameQuery = (text) =>
//   /what('| i)?s your name|who are you|tell me about yourself/i.test(text);

// // --- Dad Joke Recognition ---
// const isDadJokeRequest = (text) =>
//   /(tell me a joke|dad joke|make me laugh)/i.test(text);

// // --- Smart AI Endpoint ---
// app.post("/api/smart", async (req, res) => {
//   const { prompt } = req.body;
//   try {
//     if (isWeatherRequest(prompt)) {
//       const city = extractCity(prompt);
//       if (city) {
//         const result = await fetchWeather(city);
//         return res.json({ result });
//       }
//     }

//     if (isNameQuery(prompt)) {
//       return res.json({
//         result:
//           "My name is Allie, short for Artificial Language Learning & Interaction Engine. I’m here to help you with whatever you need!",
//       });
//     }

//     if (isDadJokeRequest(prompt)) {
//       const joke = await fetchDadJoke();
//       return res.json({ result: joke });
//     }

//     const completion = await openai.chat.completions.create({
//       model: "gpt-4",
//       messages: [{ role: "user", content: prompt }],
//     });

//     res.json({ result: completion.choices[0].message.content });
//   } catch (error) {
//     console.error("Smart AI Error:", error.message || error);
//     res.status(500).json({ error: "Smart AI failed" });
//   }
// });

// // --- Transcription Endpoint ---
// const upload = multer({ dest: "uploads/" });

// app.post("/api/transcribe", upload.single("file"), async (req, res) => {
//   try {
//     const file = req.file;
//     if (!file) return res.status(400).json({ error: "No audio file uploaded" });

//     const newPath = `${file.path}.mp3`;
//     fs.renameSync(file.path, newPath);

//     const transcription = await openai.audio.transcriptions.create({
//       file: fs.createReadStream(newPath),
//       model: "whisper-1",
//     });

//     fs.unlinkSync(newPath);
//     res.json({ text: transcription.text });
//   } catch (error) {
//     const message = error?.response?.data || error.message;
//     console.error("Whisper transcription error:", message);
//     res.status(500).json({ error: "Failed to transcribe audio" });
//   }
// });

// // --- Server Start ---
// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });

// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { OpenAI } = require("openai");
// const multer = require("multer");
// const fs = require("fs");

// dotenv.config();
// const app = express();
// const PORT = process.env.PORT || 5000;

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// app.use(cors());
// app.use(express.json());

// // Enhanced weather keyword detection
// const isWeatherRequest = (text) =>
//   /(weather|temperature|degrees) in ([a-zA-Z\s,]+)/i.test(text);

// const extractCity = (text) => {
//   const match = text.match(/(?:weather|temperature|degrees) in ([a-zA-Z\s,]+)/i);
//   return match ? match[1].trim() : null;
// };

// const fetchWeather = async (city) => {
//   try {
//     const formattedCity = city.replace(/,/g, "").split(" ")[0]; // "Chicago, Illinois" -> "Chicago"
//     const url = `https://open-weather13.p.rapidapi.com/city/${formattedCity}/US?units=imperial`;
//     console.log("🔍 Weather API URL:", url);

//     const response = await fetch(url, {
//       headers: {
//         "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
//         "X-RapidAPI-Host": "open-weather13.p.rapidapi.com",
//       },
//     });

//     const data = await response.json();
//     console.log("📦 Weather API Response:", data);

//     if (!data.main || !data.weather || !data.sys || !data.wind) {
//       throw new Error("Incomplete weather data");
//     }

//     const tempF = data.main.temp;
//     const humidity = data.main.humidity;
//     const windSpeedMph = data.wind.speed;

//     return `The current weather in ${data.name}, ${data.sys.country} is ${data.weather[0].description} with a temperature of ${tempF.toFixed(1)}°F, humidity of ${humidity}% and wind speed of ${windSpeedMph.toFixed(1)} mph.`;
//   } catch (error) {
//     console.error("❌ Weather API error:", error);
//     return `Sorry, I couldn't retrieve the weather for "${city}".`;
//   }
// };

// // Name recognition
// const isNameQuery = (text) =>
//   /what('| i)?s your name|who are you|tell me about yourself/i.test(text);

// app.post("/api/smart", async (req, res) => {
//   const { prompt } = req.body;
//   try {
//     if (isWeatherRequest(prompt)) {
//       const city = extractCity(prompt);
//       if (city) {
//         const result = await fetchWeather(city);
//         return res.json({ result });
//       }
//     }

//     if (isNameQuery(prompt)) {
//       return res.json({
//         result:
//           "My name is Allie, short for Artificial Language Learning & Interaction Engine. I’m here to help you with whatever you need!",
//       });
//     }

//     const completion = await openai.chat.completions.create({
//       model: "gpt-4",
//       messages: [{ role: "user", content: prompt }],
//     });

//     res.json({ result: completion.choices[0].message.content });
//   } catch (error) {
//     console.error("Smart AI Error:", error.message || error);
//     res.status(500).json({ error: "Smart AI failed" });
//   }
// });

// const upload = multer({ dest: "uploads/" });

// app.post("/api/transcribe", upload.single("file"), async (req, res) => {
//   try {
//     const file = req.file;
//     if (!file) return res.status(400).json({ error: "No audio file uploaded" });

//     const newPath = `${file.path}.mp3`;
//     fs.renameSync(file.path, newPath);

//     const transcription = await openai.audio.transcriptions.create({
//       file: fs.createReadStream(newPath),
//       model: "whisper-1",
//     });

//     fs.unlinkSync(newPath);
//     res.json({ text: transcription.text });
//   } catch (error) {
//     const message = error?.response?.data || error.message;
//     console.error("Whisper transcription error:", message);
//     res.status(500).json({ error: "Failed to transcribe audio" });
//   }
// });

// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });
