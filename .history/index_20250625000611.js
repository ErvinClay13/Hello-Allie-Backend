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

// --- World Time by IP ---
const fetchLocalTimeByIP = async () => {
  try {
    const response = await axios.get(`https://api.ipgeolocation.io/timezone?apiKey=${process.env.IPGEOLOCATION_API_KEY}`);
    const { date_time_txt, timezone, geo } = response.data;
    return `The current local time is ${date_time_txt} in ${geo.city}, ${geo.country_name} (${timezone}).`;
  } catch (error) {
    console.error("❌ World Time API error:", error);
    return "Sorry, I couldn't fetch the current local time.";
  }
};

// --- NBA Date Utilities ---
const getNBAFormattedDate = (offsetDays = 0) => {
  const easternNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  easternNow.setDate(easternNow.getDate() + offsetDays);
  const formattedDate = `${easternNow.getFullYear()}${(easternNow.getMonth() + 1).toString().padStart(2, "0")}${easternNow.getDate().toString().padStart(2, "0")}`;
  const readableDate = easternNow.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return { formattedDate, readableDate };
};

const isNBAScheduleRequest = (text) => {
  const lower = text.toLowerCase();
  return (
    lower.includes("nba schedule") ||
    lower.includes("nba games") ||
    lower.includes("nba scores") ||
    lower.includes("nba today") ||
    lower.includes("nba yesterday") ||
    lower.includes("nba right now") ||
    lower.includes("whose winnig right now") ||
    lower.includes("nba playoffs") ||
    lower.includes("nba 2 days ago")
  );
};

const detectNBADateOffset = (text) => {
  const lower = text.toLowerCase();
  if (lower.includes("2 days ago")) return -2;
  if (lower.includes("yesterday")) return -1;
  return 0;
};

const fetchNBAScoreboard = async (date) => {
  try {
    const options = {
      method: "GET",
      url: "https://nba-api-free-data.p.rapidapi.com/nba-scoreboard-by-date",
      params: { date },
      headers: {
        "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "nba-api-free-data.p.rapidapi.com",
      },
    };
    const response = await axios.request(options);
    const events = response.data?.response?.Events || [];
    if (events.length === 0) return `No NBA games found for that date.`;

    const liveGames = [], finalGames = [], scheduledGames = [];
    for (const event of events) {
      const competitors = event.competitions?.competitors || [];
      const home = competitors.find(c => c.homeAway === "home");
      const away = competitors.find(c => c.homeAway === "away");
      const homeName = home?.team?.displayName || "Home Team";
      const homeScore = home?.score ?? "0";
      const awayName = away?.team?.displayName || "Away Team";
      const awayScore = away?.score ?? "0";
      const gameStatus = event.status?.type?.name || "STATUS_SCHEDULED";
      const clock = event.status?.displayClock || "";
      const period = event.status?.period || "";
      let gameLine = `${awayName} ${awayScore} - ${homeScore} ${homeName}`;
      if (gameStatus === "STATUS_IN_PROGRESS") {
        gameLine += ` (LIVE 🔴 Q${period} ${clock})`;
        liveGames.push(gameLine);
      } else if (gameStatus === "STATUS_FINAL") {
        gameLine += ` (Final)`;
        finalGames.push(gameLine);
      } else {
        gameLine += ` (Scheduled)`;
        scheduledGames.push(gameLine);
      }
    }

    let output = "";
    if (liveGames.length > 0) output += `🔴 LIVE NOW (${liveGames.length} Game${liveGames.length > 1 ? "s" : ""}):\n${liveGames.join("\n")}\n\n`;
    if (finalGames.length > 0) output += `🏁 FINAL SCORES (${finalGames.length} Game${finalGames.length > 1 ? "s" : ""}):\n${finalGames.join("\n")}\n\n`;
    if (scheduledGames.length > 0) output += `🕒 UPCOMING GAMES (${scheduledGames.length} Game${scheduledGames.length > 1 ? "s" : ""}):\n${scheduledGames.join("\n")}`;
    return output.trim();
  } catch (error) {
    console.error("❌ NBA Scoreboard API error:", error);
    return "Failed to fetch NBA live scores.";
  }
};

const isWeatherRequest = (text) => /(weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i.test(text);
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
    const tempF = data.main.temp;
    const humidity = data.main.humidity;
    const windSpeedMph = data.wind.speed;
    return `The current weather in ${data.name}, ${data.sys.country} is ${data.weather[0].description} with a temperature of ${tempF.toFixed(1)}°F, humidity of ${humidity}% and wind speed of ${windSpeedMph.toFixed(1)} mph.`;
  } catch (error) {
    console.error("❌ Weather API error:", error);
    return `Sorry, I couldn't retrieve the weather for "${city}".`;
  }
};

const isNameQuery = (text) => /what('| i)?s your name|who are you|tell me about yourself/i.test(text);
const isDadJokeRequest = (text) => /(tell me a joke|dad joke|make me laugh|joke|say something funny)/i.test(text);

const fetchDadJoke = async () => {
  try {
    const response = await axios.get("https://dad-jokes-by-api-ninjas.p.rapidapi.com/v1/dadjokes", {
      headers: {
        "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "dad-jokes-by-api-ninjas.p.rapidapi.com",
      },
    });
    return response.data?.[0]?.joke || "Couldn't find a dad joke right now, sorry!";
  } catch (error) {
    console.error("❌ Dad Joke API error:", error);
    return "Failed to fetch a dad joke.";
  }
};

app.post("/api/smart", async (req, res) => {
  const { prompt, conversationHistory = [], personality } = req.body;

  try {
    if (/what('| i)?s the time|what('| i)?s the date|current time|current date|local time/i.test(prompt)) {
      const timeResult = await fetchLocalTimeByIP();
      return res.json({ result: timeResult });
    }

    if (isWeatherRequest(prompt)) {
      const city = extractCity(prompt);
      if (city) {
        const result = await fetchWeather(city);
        return res.json({ result });
      }
    }

    if (isNameQuery(prompt)) {
      return res.json({ result: "My name is Allie, short for Artificial Language Learning & Interaction Engine. I’m here to help you with whatever you need!" });
    }

    if (isDadJokeRequest(prompt)) {
      const joke = await fetchDadJoke();
      return res.json({ result: joke });
    }

    if (isNBAScheduleRequest(prompt)) {
      const offset = detectNBADateOffset(prompt);
      const { formattedDate, readableDate } = getNBAFormattedDate(offset);
      const games = await fetchNBAScoreboard(formattedDate);
      return res.json({ result: `NBA games for ${readableDate}:\n\n${games}` });
    }

    const personalityPrompts = {
      friendly: "Respond in a warm, kind, helpful tone like a friendly assistant.",
      sassy: "Respond with sass, wit, and sarcasm — like a bold assistant with attitude.",
      motivational: "Respond like a motivational coach, full of encouragement and energy.",
      humorous: "Respond with humor — clever, funny, and light-hearted.",
    };

    const wrapper = personalityPrompts[personality?.toLowerCase()] || "";

    const messages = [
      { role: "system", content: wrapper },
      ...conversationHistory.map((entry) => ({ role: entry.role, content: entry.content })),
      { role: "user", content: prompt },
    ];

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







//06/24/25
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

// // --- World Time by IP ---
// const fetchLocalTimeByIP = async () => {
//   try {
//     const response = await axios.get(`https://api.ipgeolocation.io/timezone?apiKey=${process.env.IPGEOLOCATION_API_KEY}`);
    
//     const { date_time_txt, timezone, geo } = response.data;

//     return `The current local time is ${date_time_txt} in ${geo.city}, ${geo.country_name} (${timezone}).`;
//   } catch (error) {
//     console.error("❌ World Time API error:", error);
//     return "Sorry, I couldn't fetch the current local time.";
//   }
// };

// // --- NBA Date Utilities ---
// const getNBAFormattedDate = (offsetDays = 0) => {
//   const easternNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
//   easternNow.setDate(easternNow.getDate() + offsetDays);

//   const formattedDate = `${easternNow.getFullYear()}${(easternNow.getMonth() + 1).toString().padStart(2, "0")}${easternNow.getDate().toString().padStart(2, "0")}`;
//   const readableDate = easternNow.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

//   return { formattedDate, readableDate };
// };

// const isNBAScheduleRequest = (text) => {
//   const lower = text.toLowerCase();
//   return (
//     lower.includes("nba schedule") ||
//     lower.includes("nba games") ||
//     lower.includes("nba scores") ||
//     lower.includes("nba today") ||
//     lower.includes("nba yesterday") ||
//     lower.includes("nba right now") ||
//     lower.includes("whose winnig right now") ||
//     lower.includes("nba playoffs") ||
//     lower.includes("nba 2 days ago")
//   );
// };

// const detectNBADateOffset = (text) => {
//   const lower = text.toLowerCase();
//   if (lower.includes("2 days ago")) return -2;
//   if (lower.includes("yesterday")) return -1;
//   return 0; // Default today
// };

// // --- Fetch NBA Scores Grouped ---
// const fetchNBAScoreboard = async (date) => {
//   try {
//     const options = {
//       method: "GET",
//       url: "https://nba-api-free-data.p.rapidapi.com/nba-scoreboard-by-date",
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

//     const liveGames = [];
//     const finalGames = [];
//     const scheduledGames = [];

//     for (const event of events) {
//       const competitors = event.competitions?.competitors || [];

//       const home = competitors.find(c => c.homeAway === "home");
//       const away = competitors.find(c => c.homeAway === "away");

//       const homeName = home?.team?.displayName || "Home Team";
//       const homeScore = home?.score ?? "0";

//       const awayName = away?.team?.displayName || "Away Team";
//       const awayScore = away?.score ?? "0";

//       const gameStatus = event.status?.type?.name || "STATUS_SCHEDULED";
//       const clock = event.status?.displayClock || "";
//       const period = event.status?.period || "";

//       let gameLine = `${awayName} ${awayScore} - ${homeScore} ${homeName}`;

//       if (gameStatus === "STATUS_IN_PROGRESS") {
//         gameLine += ` (LIVE 🔴 Q${period} ${clock})`;
//         liveGames.push(gameLine);
//       } else if (gameStatus === "STATUS_FINAL") {
//         gameLine += ` (Final)`;
//         finalGames.push(gameLine);
//       } else {
//         gameLine += ` (Scheduled)`;
//         scheduledGames.push(gameLine);
//       }
//     }

//     let output = "";

//     if (liveGames.length > 0) {
//       output += `🔴 LIVE NOW (${liveGames.length} Game${liveGames.length > 1 ? "s" : ""}):\n${liveGames.join("\n")}\n\n`;
//     }

//     if (finalGames.length > 0) {
//       output += `🏁 FINAL SCORES (${finalGames.length} Game${finalGames.length > 1 ? "s" : ""}):\n${finalGames.join("\n")}\n\n`;
//     }

//     if (scheduledGames.length > 0) {
//       output += `🕒 UPCOMING GAMES (${scheduledGames.length} Game${scheduledGames.length > 1 ? "s" : ""}):\n${scheduledGames.join("\n")}`;
//     }

//     return output.trim();
//   } catch (error) {
//     console.error("❌ NBA Scoreboard API error:", error);
//     return "Failed to fetch NBA live scores.";
//   }
// };

// // --- Weather API ---
// const isWeatherRequest = (text) =>
//   /(weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i.test(text);

// const extractCity = (text) => {
//   const match = text.match(/(?:weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i);
//   return match ? match[1].trim() : null;
// };

// const fetchWeather = async (city) => {
//   try {
//     const formattedCity = city.replace(/,/g, "").split(" ")[0];
//     const url = `https://open-weather13.p.rapidapi.com/city/${formattedCity}/US?units=imperial`;

//     const response = await axios.get(url, {
//       headers: {
//         "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
//         "X-RapidAPI-Host": "open-weather13.p.rapidapi.com",
//       },
//     });

//     const data = response.data;

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

// // --- Name and Dad Joke API ---
// const isNameQuery = (text) =>
//   /what('| i)?s your name|who are you|tell me about yourself/i.test(text);

// const isDadJokeRequest = (text) =>
//   /(tell me a joke|dad joke|make me laugh|joke|say something funny)/i.test(text);

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

// // --- SMART AI MAIN ENDPOINT ---
// app.post("/api/smart", async (req, res) => {
//   const { prompt, conversationHistory = [] } = req.body;
//   try {
//     // Detect World Time Request
//     if (/what('| i)?s the time|what('| i)?s the date|current time|current date|local time/i.test(prompt)) {
//       const timeResult = await fetchLocalTimeByIP();
//       return res.json({ result: timeResult });
//     }

//     // Detect Weather Request
//     if (isWeatherRequest(prompt)) {
//       const city = extractCity(prompt);
//       if (city) {
//         const result = await fetchWeather(city);
//         return res.json({ result });
//       }
//     }

//     // Detect Name Query
//     if (isNameQuery(prompt)) {
//       return res.json({
//         result: "My name is Allie, short for Artificial Language Learning & Interaction Engine. I’m here to help you with whatever you need!",
//       });
//     }

//     // Detect Dad Joke
//     if (isDadJokeRequest(prompt)) {
//       const joke = await fetchDadJoke();
//       return res.json({ result: joke });
//     }

//     // Detect NBA Schedule Request
//     if (isNBAScheduleRequest(prompt)) {
//       const offset = detectNBADateOffset(prompt);
//       const { formattedDate, readableDate } = getNBAFormattedDate(offset);

//       const games = await fetchNBAScoreboard(formattedDate);
//       return res.json({ result: `NBA games for ${readableDate}:\n\n${games}` });
//     }

//     // Default: Smart AI
//     const messages = conversationHistory.map(entry => ({
//       role: entry.role,
//       content: entry.content
//     }));

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

// // --- Whisper Transcription Endpoint ---
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

// // --- New York NBA Date Helper ---
// const getNBAFormattedDate = (offsetDays = 0) => {
//   const easternNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
//   easternNow.setDate(easternNow.getDate() + offsetDays);

//   const formattedDate = `${easternNow.getFullYear()}${(easternNow.getMonth() + 1).toString().padStart(2, "0")}${easternNow.getDate().toString().padStart(2, "0")}`;
//   const readableDate = easternNow.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

//   return { formattedDate, readableDate };
// };

// // --- NBA Request Detectors ---
// const isNBAScheduleRequest = (text) => {
//   const lower = text.toLowerCase();
//   return (
//     lower.includes("nba schedule") ||
//     lower.includes("nba games") ||
//     lower.includes("nba scores") ||
//     lower.includes("nba today") ||
//     lower.includes("nba yesterday") ||
//     lower.includes("nba 2 days ago")
//   );
// };

// const detectNBADateOffset = (text) => {
//   const lower = text.toLowerCase();
//   if (lower.includes("2 days ago")) return -2;
//   if (lower.includes("yesterday")) return -1;
//   return 0; // Default to today
// };

// // --- Fetch NBA Scoreboard with Grouped Sections ---
// const fetchNBAScoreboard = async (date) => {
//   try {
//     const options = {
//       method: "GET",
//       url: "https://nba-api-free-data.p.rapidapi.com/nba-scoreboard-by-date",
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

//     const liveGames = [];
//     const finalGames = [];
//     const scheduledGames = [];

//     for (const event of events) {
//       const competitors = event.competitions?.competitors || [];

//       const home = competitors.find(c => c.homeAway === "home");
//       const away = competitors.find(c => c.homeAway === "away");

//       const homeName = home?.team?.displayName || "Home Team";
//       const homeScore = home?.score ?? "0";

//       const awayName = away?.team?.displayName || "Away Team";
//       const awayScore = away?.score ?? "0";

//       const gameStatus = event.status?.type?.name || "STATUS_SCHEDULED";
//       const clock = event.status?.displayClock || "";
//       const period = event.status?.period || "";

//       let gameLine = `${awayName} ${awayScore} - ${homeScore} ${homeName}`;

//       if (gameStatus === "STATUS_IN_PROGRESS") {
//         gameLine += ` (LIVE 🔴 Q${period} ${clock})`;
//         liveGames.push(gameLine);
//       } else if (gameStatus === "STATUS_FINAL") {
//         gameLine += ` (Final)`;
//         finalGames.push(gameLine);
//       } else {
//         gameLine += ` (Scheduled)`;
//         scheduledGames.push(gameLine);
//       }
//     }

//     let output = "";

//     if (liveGames.length > 0) {
//       output += `🔴 LIVE NOW (${liveGames.length} Game${liveGames.length > 1 ? "s" : ""}):\n${liveGames.join("\n")}\n\n`;
//     }

//     if (finalGames.length > 0) {
//       output += `🏁 FINAL SCORES (${finalGames.length} Game${finalGames.length > 1 ? "s" : ""}):\n${finalGames.join("\n")}\n\n`;
//     }

//     if (scheduledGames.length > 0) {
//       output += `🕒 UPCOMING GAMES (${scheduledGames.length} Game${scheduledGames.length > 1 ? "s" : ""}):\n${scheduledGames.join("\n")}`;
//     }

//     return output.trim();
//   } catch (error) {
//     console.error("❌ NBA Scoreboard API error:", error);
//     return "Failed to fetch NBA live scores.";
//   }
// };

// // --- Weather API ---
// const isWeatherRequest = (text) =>
//   /(weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i.test(text);

// const extractCity = (text) => {
//   const match = text.match(/(?:weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i);
//   return match ? match[1].trim() : null;
// };

// const fetchWeather = async (city) => {
//   try {
//     const formattedCity = city.replace(/,/g, "").split(" ")[0];
//     const url = `https://open-weather13.p.rapidapi.com/city/${formattedCity}/US?units=imperial`;

//     const response = await axios.get(url, {
//       headers: {
//         "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
//         "X-RapidAPI-Host": "open-weather13.p.rapidapi.com",
//       },
//     });

//     const data = response.data;

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

// // --- Name and Dad Joke Detection ---
// const isNameQuery = (text) =>
//   /what('| i)?s your name|who are you|tell me about yourself/i.test(text);

// const isDadJokeRequest = (text) =>
//   /(tell me a joke|dad joke|make me laugh|joke|say something funny)/i.test(text);

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
//         result: "My name is Allie, short for Artificial Language Learning & Interaction Engine. I’m here to help you with whatever you need!",
//       });
//     }

//     if (isDadJokeRequest(prompt)) {
//       const joke = await fetchDadJoke();
//       return res.json({ result: joke });
//     }

//     if (isNBAScheduleRequest(prompt)) {
//       const offset = detectNBADateOffset(prompt);
//       const { formattedDate, readableDate } = getNBAFormattedDate(offset);

//       const games = await fetchNBAScoreboard(formattedDate);
//       return res.json({ result: `NBA games for ${readableDate}:\n\n${games}` });
//     }

//     const messages = conversationHistory.map(entry => ({
//       role: entry.role,
//       content: entry.content
//     }));

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
