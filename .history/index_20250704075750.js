const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { OpenAI } = require("openai");
const multer = require("multer");
const fs = require("fs");
const axios = require("axios");
const db = require("./config/firebaseAdmin.js");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json());

// === UTILITY FUNCTIONS ===

const fetchLocalTimeByIP = async () => {
  try {
    const response = await axios.get(
      `https://api.ipgeolocation.io/timezone?apiKey=${process.env.IPGEOLOCATION_API_KEY}`
    );
    const { date_time_txt, timezone, geo } = response.data;
    return `The current local time is ${date_time_txt} in ${geo.city}, ${geo.country_name} (${timezone}).`;
  } catch (error) {
    console.error("❌ World Time API error:", error);
    return "Sorry, I couldn't fetch the current local time.";
  }
};

const getNBAFormattedDate = (offsetDays = 0) => {
  const easternNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  easternNow.setDate(easternNow.getDate() + offsetDays);
  const formattedDate = `${easternNow.getFullYear()}${(
    easternNow.getMonth() + 1
  )
    .toString()
    .padStart(2, "0")}${easternNow.getDate().toString().padStart(2, "0")}`;
  const readableDate = easternNow.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return { formattedDate, readableDate };
};

const isNBAScheduleRequest = (text) =>
  /nba schedule|nba games|nba scores|nba today|nba yesterday|nba right now|who's winning right now|nba playoffs|nba 2 days ago/i.test(
    text
  );
const detectNBADateOffset = (text) =>
  text.includes("2 days ago") ? -2 : text.includes("yesterday") ? -1 : 0;

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

    const liveGames = [],
      finalGames = [],
      scheduledGames = [];
    for (const event of events) {
      const competitors = event.competitions?.competitors || [];
      const home = competitors.find((c) => c.homeAway === "home");
      const away = competitors.find((c) => c.homeAway === "away");
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
    if (liveGames.length > 0)
      output += `🔴 LIVE NOW (${liveGames.length}):\n${liveGames.join(
        "\n"
      )}\n\n`;
    if (finalGames.length > 0)
      output += `🏁 FINAL SCORES (${finalGames.length}):\n${finalGames.join(
        "\n"
      )}\n\n`;
    if (scheduledGames.length > 0)
      output += `🕒 UPCOMING GAMES (${
        scheduledGames.length
      }):\n${scheduledGames.join("\n")}`;
    return output.trim();
  } catch (error) {
    console.error("❌ NBA Scoreboard API error:", error);
    return "Failed to fetch NBA live scores.";
  }
};

const isWeatherRequest = (text) =>
  /(weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i.test(
    text
  );
const extractCity = (text) =>
  text
    .match(
      /(?:weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i
    )?.[1]
    ?.trim();

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
    return `The current weather in ${data.name}, ${data.sys.country} is ${
      data.weather[0].description
    } with a temperature of ${tempF.toFixed(
      1
    )}°F, humidity of ${humidity}% and wind speed of ${windSpeedMph.toFixed(
      1
    )} mph.`;
  } catch (error) {
    console.error("❌ Weather API error:", error);
    return `Sorry, I couldn't retrieve the weather for "${city}".`;
  }
};

const isNameQuery = (text) =>
  /what('| i)?s your name|who are you|tell me about yourself/i.test(text);
const isDadJokeRequest = (text) =>
  /(tell me a joke|dad joke|make me laugh|joke|say something funny)/i.test(
    text
  );

const fetchDadJoke = async () => {
  try {
    const response = await axios.get(
      "https://dad-jokes-by-api-ninjas.p.rapidapi.com/v1/dadjokes",
      {
        headers: {
          "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
          "X-RapidAPI-Host": "dad-jokes-by-api-ninjas.p.rapidapi.com",
        },
      }
    );
    return (
      response.data?.[0]?.joke || "Couldn't find a dad joke right now, sorry!"
    );
  } catch (error) {
    console.error("❌ Dad Joke API error:", error);
    return "Failed to fetch a dad joke.";
  }
};

const personalityPrompts = {
  friendly:
    "You are Allie, a warm and kind assistant who speaks in a friendly, encouraging tone.",
  sassy:
    "You are Allie, a sarcastic, witty assistant who doesn’t hold back and loves throwing playful shade.",
  motivational:
    "You are Allie, a high-energy motivational coach who inspires users like a personal hype squad.",
  humorous:
    "You are Allie, a clever, funny assistant who always responds with a comedic twist.",
};

// === SMART AI ROUTE ===

app.post("/api/smart", async (req, res) => {
  const { prompt, conversationHistory = [], personality, mode } = req.body;
  const personalityKey = (personality || mode || "friendly").toLowerCase();

  try {
    if (
      /what('| i)?s the time|what('| i)?s the date|current time|current date|local time/i.test(
        prompt
      )
    ) {
      return res.json({ result: await fetchLocalTimeByIP() });
    }

    if (isWeatherRequest(prompt)) {
      const city = extractCity(prompt);
      if (city) return res.json({ result: await fetchWeather(city) });
    }

    if (isNameQuery(prompt)) {
      return res.json({
        result:
          "My name is Allie, short for Artificial Language Learning & Interaction Engine. I’m here to help you with whatever you need!",
      });
    }

    if (isDadJokeRequest(prompt)) {
      return res.json({ result: await fetchDadJoke() });
    }

    if (isNBAScheduleRequest(prompt)) {
      const offset = detectNBADateOffset(prompt);
      const { formattedDate, readableDate } = getNBAFormattedDate(offset);
      const games = await fetchNBAScoreboard(formattedDate);
      return res.json({ result: `NBA games for ${readableDate}:\n\n${games}` });
    }

    const wrapper =
      personalityPrompts[personalityKey] || personalityPrompts.friendly;
    const messages = [
      { role: "system", content: wrapper },
      ...conversationHistory.map((entry) => ({
        role: entry.role,
        content: entry.content,
      })),
      { role: "user", content: prompt },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
      temperature: 0.8,
    });

    res.json({ result: completion.choices[0].message.content.trim() });
  } catch (error) {
    console.error("Smart AI Error:", error.message || error);
    res.status(500).json({ error: "Smart AI failed" });
  }
});

// === TRANSCRIBE ROUTE ===

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

// === SMART SCHEDULE ROUTE (VIEW + ADD ONLY) ===

app.post("/api/schedule", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) return res.status(400).json({ error: "Prompt is required" });

  try {
    // View schedule
    if (
      /what('| i)?s on my schedule|what('| i)?s my schedule|show schedule|list schedule/i.test(
        prompt
      )
    ) {
      const snapshot = await db
        .collection("schedules")
        .orderBy("createdAt", "desc")
        .get();
      const events = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      if (events.length === 0)
        return res.json({ message: "Your schedule is empty." });
      const eventList = events
        .map((event) => `${event.task} at ${event.time} on ${event.date}`)
        .join("\n");
      return res.json({
        message: `Here are your upcoming events:\n\n${eventList}`,
      });
    }


   app.post("/api/schedule", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) return res.status(400).json({ error: "Prompt is required" });

  try {
    // View schedule
    if (/what('| i)?s on my schedule|what('| i)?s my schedule|show schedule|list schedule/i.test(prompt)) {
      const snapshot = await db.collection("schedules").orderBy("createdAt", "desc").get();
      const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (events.length === 0) return res.json({ message: "Your schedule is empty." });
      const eventList = events.map(event => `${event.task} at ${event.time} on ${event.date}`).join("\n");
      return res.json({ message: `Here are your upcoming events:\n\n${eventList}` });
    }

    // Add event with improved parsing
    const taskMatch = prompt.match(/remind me to (.+?)(?: at| on|$)/i);
    let timeMatch = prompt.match(/at ([0-9]{1,2}(?::[0-9]{2})?\s?(am|pm)?)/i);
    let dateMatch = prompt.match(/on (today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);

    // If no dateMatch found, check for day words without "on"
    if (!dateMatch) {
      dateMatch = prompt.match(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    }

    // If no timeMatch found, check for standalone time elsewhere in prompt
    if (!timeMatch) {
      timeMatch = prompt.match(/([0-9]{1,2}(?::[0-9]{2})?\s?(am|pm)?)/i);
    }

    const task = taskMatch ? taskMatch[1].trim() : null;
    const time = timeMatch ? timeMatch[1].toLowerCase() : "unspecified";
    const date = dateMatch ? dateMatch[1].toLowerCase() : "unspecified";

    if (task) {
      await db.collection("schedules").add({
        task,
        task_lower: task.toLowerCase(),
        time,
        date,
        createdAt: new Date(),
      });
      return res.json({ message: `Added "${task}" at ${time} on ${date}.` });
    } else {
      return res.json({ message: "Could not parse your scheduling command." });
    }
  } catch (error) {
    console.error("Schedule API error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// === SCHEDULE DELETE ROUTE (FUZZY DELETE + CONFIRMATION + ID-BASED) ===

app.post("/api/schedule/delete", async (req, res) => {
  const { prompt, id } = req.body;

  try {
    if (id) {
      await db.collection("schedules").doc(id).delete();
      return res.json({ message: "Event deleted successfully." });
    }

    if (!prompt) {
      return res
        .status(400)
        .json({ error: "Prompt or id is required to delete an event." });
    }

    const snapshot = await db.collection("schedules").get();
    const events = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    let keyword = prompt.trim().toLowerCase();
    keyword = keyword
      .replace(/^delete\s*/i, "")
      .replace(/^remove\s*/i, "")
      .trim();

    const matches = events.filter((event) =>
      event.task_lower.includes(keyword)
    );

    if (matches.length === 0) {
      return res.json({ message: `No events found containing "${keyword}".` });
    } else if (matches.length === 1) {
      const docRef = db.collection("schedules").doc(matches[0].id);
      await docRef.delete();
      return res.json({ message: `Deleted "${matches[0].task}".` });
    } else {
      const list = matches
        .map(
          (event, i) =>
            `${i + 1}. ${event.task} at ${event.time} on ${event.date} (ID: ${
              event.id
            })`
        )
        .join("\n");
      return res.json({
        message: `I found multiple matches:\n\n${list}\n\nPlease provide the specific ID to delete.`,
      });
    }
  } catch (error) {
    console.error("Schedule Delete API error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// === SERVER START ===

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
// const db = require("./config/firebaseAdmin.js");

// dotenv.config();
// const app = express();
// const PORT = process.env.PORT || 5000;

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// app.use(cors());
// app.use(express.json());

// // === Utility Functions ===
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

// const getNBAFormattedDate = (offsetDays = 0) => {
//   const easternNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
//   easternNow.setDate(easternNow.getDate() + offsetDays);
//   const formattedDate = `${easternNow.getFullYear()}${(easternNow.getMonth() + 1).toString().padStart(2, "0")}${easternNow.getDate().toString().padStart(2, "0")}`;
//   const readableDate = easternNow.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
//   return { formattedDate, readableDate };
// };

// const isNBAScheduleRequest = (text) => /nba schedule|nba games|nba scores|nba today|nba yesterday|nba right now|whose winning right now|nba playoffs|nba 2 days ago/i.test(text);
// const detectNBADateOffset = (text) => text.includes("2 days ago") ? -2 : text.includes("yesterday") ? -1 : 0;

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
//     if (events.length === 0) return `No NBA games found for that date.`;

//     const liveGames = [], finalGames = [], scheduledGames = [];
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
//     if (liveGames.length > 0) output += `🔴 LIVE NOW (${liveGames.length}):\n${liveGames.join("\n")}\n\n`;
//     if (finalGames.length > 0) output += `🏁 FINAL SCORES (${finalGames.length}):\n${finalGames.join("\n")}\n\n`;
//     if (scheduledGames.length > 0) output += `🕒 UPCOMING GAMES (${scheduledGames.length}):\n${scheduledGames.join("\n")}`;
//     return output.trim();
//   } catch (error) {
//     console.error("❌ NBA Scoreboard API error:", error);
//     return "Failed to fetch NBA live scores.";
//   }
// };

// const isWeatherRequest = (text) => /(weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i.test(text);
// const extractCity = (text) => text.match(/(?:weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i)?.[1]?.trim();

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
//     const tempF = data.main.temp;
//     const humidity = data.main.humidity;
//     const windSpeedMph = data.wind.speed;
//     return `The current weather in ${data.name}, ${data.sys.country} is ${data.weather[0].description} with a temperature of ${tempF.toFixed(1)}°F, humidity of ${humidity}% and wind speed of ${windSpeedMph.toFixed(1)} mph.`;
//   } catch (error) {
//     console.error("❌ Weather API error:", error);
//     return `Sorry, I couldn't retrieve the weather for "${city}".`;
//   }
// };

// const isNameQuery = (text) => /what('| i)?s your name|who are you|tell me about yourself/i.test(text);
// const isDadJokeRequest = (text) => /(tell me a joke|dad joke|make me laugh|joke|say something funny)/i.test(text);

// const fetchDadJoke = async () => {
//   try {
//     const response = await axios.get("https://dad-jokes-by-api-ninjas.p.rapidapi.com/v1/dadjokes", {
//       headers: {
//         "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
//         "X-RapidAPI-Host": "dad-jokes-by-api-ninjas.p.rapidapi.com",
//       },
//     });
//     return response.data?.[0]?.joke || "Couldn't find a dad joke right now, sorry!";
//   } catch (error) {
//     console.error("❌ Dad Joke API error:", error);
//     return "Failed to fetch a dad joke.";
//   }
// };

// const personalityPrompts = {
//   friendly: "You are Allie, a warm and kind assistant who speaks in a friendly, encouraging tone.",
//   sassy: "You are Allie, a sarcastic, witty assistant who doesn’t hold back and loves throwing playful shade.",
//   motivational: "You are Allie, a high-energy motivational coach who inspires users like a personal hype squad.",
//   humorous: "You are Allie, a clever, funny assistant who always responds with a comedic twist."
// };

// // === Smart Scheduling delete helper ===
// const isDeleteRequest = (text) => /(delete|remove|cancel)\s(.+)/i.test(text);
// const extractDeleteTask = (text) => text.match(/(?:delete|remove|cancel)\s(.+)/i)?.[1]?.trim();

// // === Smart AI Route ===
// app.post("/api/smart", async (req, res) => {
//   const { prompt, conversationHistory = [], personality, mode } = req.body;
//   const personalityKey = (personality || mode || "friendly").toLowerCase();

//   try {
//     if (/what('| i)?s the time|what('| i)?s the date|current time|current date|local time/i.test(prompt)) {
//       return res.json({ result: await fetchLocalTimeByIP() });
//     }

//     if (isWeatherRequest(prompt)) {
//       const city = extractCity(prompt);
//       if (city) return res.json({ result: await fetchWeather(city) });
//     }

//     if (isNameQuery(prompt)) {
//       return res.json({ result: "My name is Allie, short for Artificial Language Learning & Interaction Engine. I’m here to help you with whatever you need!" });
//     }

//     if (isDadJokeRequest(prompt)) {
//       return res.json({ result: await fetchDadJoke() });
//     }

//     if (isNBAScheduleRequest(prompt)) {
//       const offset = detectNBADateOffset(prompt);
//       const { formattedDate, readableDate } = getNBAFormattedDate(offset);
//       const games = await fetchNBAScoreboard(formattedDate);
//       return res.json({ result: `NBA games for ${readableDate}:\n\n${games}` });
//     }

//     const wrapper = personalityPrompts[personalityKey] || personalityPrompts.friendly;

//     const messages = [
//       { role: "system", content: wrapper },
//       ...conversationHistory.map(entry => ({ role: entry.role, content: entry.content })),
//       { role: "user", content: prompt },
//     ];

//     const completion = await openai.chat.completions.create({
//       model: "gpt-4",
//       messages,
//       temperature: 0.8,
//     });

//     res.json({ result: completion.choices[0].message.content.trim() });
//   } catch (error) {
//     console.error("Smart AI Error:", error.message || error);
//     res.status(500).json({ error: "Smart AI failed" });
//   }
// });

// // === Whisper transcription ===
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

// // === Smart Scheduling route ===
// app.post("/api/schedule", async (req, res) => {
//   const { prompt } = req.body;

//   if (!prompt) {
//     return res.status(400).json({ error: "Prompt is required" });
//   }

//   try {
//     // Delete by task
//     if (isDeleteRequest(prompt)) {
//       const taskToDelete = extractDeleteTask(prompt);

//       const snapshot = await db.collection("schedules").where("task", "==", taskToDelete).get();
//       if (snapshot.empty) {
//         return res.status(200).json({ message: `No event found with task "${taskToDelete}".` });
//       }

//       const batch = db.batch();
//       snapshot.forEach(doc => {
//         batch.delete(doc.ref);
//       });
//       await batch.commit();

//       return res.status(200).json({ message: `Deleted event(s) with task "${taskToDelete}".` });
//     }

//     // Add new event
//     const taskMatch = prompt.match(/remind me to (.+?) at/i);
//     const timeMatch = prompt.match(/at ([0-9]{1,2}(?::[0-9]{2})?\s?(?:am|pm)?)/i);
//     const dateMatch = prompt.match(/(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);

//     if (taskMatch && timeMatch && dateMatch) {
//       const task = taskMatch[1].trim();
//       const time = timeMatch[1].trim();
//       const date = dateMatch[1].trim();

//       const docRef = await db.collection("schedules").add({
//         task,
//         date,
//         time,
//         createdAt: new Date(),
//       });

//       return res.status(200).json({ message: "Event saved", id: docRef.id });
//     }

//     // Get schedule
//     if (prompt.toLowerCase().includes("what") && prompt.toLowerCase().includes("schedule")) {
//       const snapshot = await db.collection("schedules").orderBy("createdAt", "desc").get();
//       const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//       return res.status(200).json({ events });
//     }

//     return res.status(200).json({ message: "Could not parse scheduling command" });
//   } catch (error) {
//     console.error("Schedule API error:", error);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });

// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });

// // === ✅ Imports ===
// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { OpenAI } = require("openai");
// const multer = require("multer");
// const fs = require("fs");
// const axios = require("axios");
// const db = require("./config/firebaseAdmin.js"); // Firestore initialization

// dotenv.config();
// const app = express();
// const PORT = process.env.PORT || 5000;

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// app.use(cors());
// app.use(express.json());

// // === ✅ Utility Functions ===
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

// const getNBAFormattedDate = (offsetDays = 0) => {
//   const easternNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
//   easternNow.setDate(easternNow.getDate() + offsetDays);
//   const formattedDate = `${easternNow.getFullYear()}${(easternNow.getMonth() + 1).toString().padStart(2, "0")}${easternNow.getDate().toString().padStart(2, "0")}`;
//   const readableDate = easternNow.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
//   return { formattedDate, readableDate };
// };

// const isNBAScheduleRequest = (text) => /nba schedule|nba games|nba scores|nba today|nba yesterday|nba right now|whose winning right now|nba playoffs|nba 2 days ago/i.test(text);
// const detectNBADateOffset = (text) => text.includes("2 days ago") ? -2 : text.includes("yesterday") ? -1 : 0;

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
//     if (events.length === 0) return `No NBA games found for that date.`;

//     const liveGames = [], finalGames = [], scheduledGames = [];
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
//     if (liveGames.length > 0) output += `🔴 LIVE NOW (${liveGames.length}):\n${liveGames.join("\n")}\n\n`;
//     if (finalGames.length > 0) output += `🏁 FINAL SCORES (${finalGames.length}):\n${finalGames.join("\n")}\n\n`;
//     if (scheduledGames.length > 0) output += `🕒 UPCOMING GAMES (${scheduledGames.length}):\n${scheduledGames.join("\n")}`;
//     return output.trim();
//   } catch (error) {
//     console.error("❌ NBA Scoreboard API error:", error);
//     return "Failed to fetch NBA live scores.";
//   }
// };

// const isWeatherRequest = (text) => /(weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i.test(text);
// const extractCity = (text) => text.match(/(?:weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i)?.[1]?.trim();

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
//     const tempF = data.main.temp;
//     const humidity = data.main.humidity;
//     const windSpeedMph = data.wind.speed;
//     return `The current weather in ${data.name}, ${data.sys.country} is ${data.weather[0].description} with a temperature of ${tempF.toFixed(1)}°F, humidity of ${humidity}% and wind speed of ${windSpeedMph.toFixed(1)} mph.`;
//   } catch (error) {
//     console.error("❌ Weather API error:", error);
//     return `Sorry, I couldn't retrieve the weather for "${city}".`;
//   }
// };

// const isNameQuery = (text) => /what('| i)?s your name|who are you|tell me about yourself/i.test(text);
// const isDadJokeRequest = (text) => /(tell me a joke|dad joke|make me laugh|joke|say something funny)/i.test(text);

// const fetchDadJoke = async () => {
//   try {
//     const response = await axios.get("https://dad-jokes-by-api-ninjas.p.rapidapi.com/v1/dadjokes", {
//       headers: {
//         "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
//         "X-RapidAPI-Host": "dad-jokes-by-api-ninjas.p.rapidapi.com",
//       },
//     });
//     return response.data?.[0]?.joke || "Couldn't find a dad joke right now, sorry!";
//   } catch (error) {
//     console.error("❌ Dad Joke API error:", error);
//     return "Failed to fetch a dad joke.";
//   }
// };

// const personalityPrompts = {
//   friendly: "You are Allie, a warm and kind assistant who speaks in a friendly, encouraging tone.",
//   sassy: "You are Allie, a sarcastic, witty assistant who doesn’t hold back and loves throwing playful shade.",
//   motivational: "You are Allie, a high-energy motivational coach who inspires users like a personal hype squad.",
//   humorous: "You are Allie, a clever, funny assistant who always responds with a comedic twist."
// };

// // === ✅ Smart AI route ===
// app.post("/api/smart", async (req, res) => {
//   const { prompt, conversationHistory = [], personality, mode } = req.body;
//   const personalityKey = (personality || mode || "friendly").toLowerCase();

//   try {
//     if (/what('| i)?s the time|what('| i)?s the date|current time|current date|local time/i.test(prompt)) {
//       return res.json({ result: await fetchLocalTimeByIP() });
//     }

//     if (isWeatherRequest(prompt)) {
//       const city = extractCity(prompt);
//       if (city) return res.json({ result: await fetchWeather(city) });
//     }

//     if (isNameQuery(prompt)) {
//       return res.json({ result: "My name is Allie, short for Artificial Language Learning & Interaction Engine. I’m here to help you with whatever you need!" });
//     }

//     if (isDadJokeRequest(prompt)) {
//       return res.json({ result: await fetchDadJoke() });
//     }

//     if (isNBAScheduleRequest(prompt)) {
//       const offset = detectNBADateOffset(prompt);
//       const { formattedDate, readableDate } = getNBAFormattedDate(offset);
//       const games = await fetchNBAScoreboard(formattedDate);
//       return res.json({ result: `NBA games for ${readableDate}:\n\n${games}` });
//     }

//     const wrapper = personalityPrompts[personalityKey] || personalityPrompts.friendly;

//     const messages = [
//       { role: "system", content: wrapper },
//       ...conversationHistory.map(entry => ({ role: entry.role, content: entry.content })),
//       { role: "user", content: prompt },
//     ];

//     const completion = await openai.chat.completions.create({
//       model: "gpt-4",
//       messages,
//       temperature: 0.8,
//     });

//     res.json({ result: completion.choices[0].message.content.trim() });
//   } catch (error) {
//     console.error("Smart AI Error:", error.message || error);
//     res.status(500).json({ error: "Smart AI failed" });
//   }
// });

// // === ✅ Transcription route ===
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

// // === ✅ Smart Scheduling POST route ===
// app.post("/api/schedule", async (req, res) => {
//   const { prompt } = req.body;

//   if (!prompt) {
//     return res.status(400).json({ error: "Prompt is required" });
//   }

//   try {
//     const taskMatch = prompt.match(/remind me to (.+?) at/i);
//     const timeMatch = prompt.match(/at ([0-9]{1,2}(?::[0-9]{2})?\s?(?:am|pm)?)/i);
//     const dateMatch = prompt.match(/(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);

//     if (taskMatch && timeMatch && dateMatch) {
//       const task = taskMatch[1].trim();
//       const time = timeMatch[1].trim();
//       const date = dateMatch[1].trim();

//       const docRef = await db.collection("schedules").add({
//         task,
//         date,
//         time,
//         createdAt: new Date(),
//       });

//       return res.status(200).json({ message: "Event saved", id: docRef.id });
//     } else if (prompt.toLowerCase().includes("what") && prompt.toLowerCase().includes("schedule")) {
//       const snapshot = await db.collection("schedules").orderBy("createdAt", "desc").get();
//       const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//       return res.status(200).json({ events });
//     } else {
//       return res.status(200).json({ message: "Could not parse scheduling command" });
//     }
//   } catch (error) {
//     console.error("Schedule API error:", error);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });

// // === ✅ DELETE Schedule Event route ===
// app.delete("/api/schedule/:id", async (req, res) => {
//   const { id } = req.params;

//   try {
//     const docRef = db.collection("schedules").doc(id);
//     const doc = await docRef.get();

//     if (!doc.exists) {
//       return res.status(404).json({ error: "Event not found" });
//     }

//     await docRef.delete();
//     return res.status(200).json({ message: "Event deleted successfully" });
//   } catch (error) {
//     console.error("Delete Schedule API error:", error);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });

// // === ✅ Start server ===
// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });

//6/29/2025
// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { OpenAI } = require("openai");
// const multer = require("multer");
// const fs = require("fs");
// const axios = require("axios");
// const db = require("./config/firebaseAdmin.js"); // ✅ Firestore initialization

// dotenv.config();
// const app = express();
// const PORT = process.env.PORT || 5000;

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// app.use(cors());
// app.use(express.json());

// // --- Utility Functions ---
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

// const getNBAFormattedDate = (offsetDays = 0) => {
//   const easternNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
//   easternNow.setDate(easternNow.getDate() + offsetDays);
//   const formattedDate = `${easternNow.getFullYear()}${(easternNow.getMonth() + 1).toString().padStart(2, "0")}${easternNow.getDate().toString().padStart(2, "0")}`;
//   const readableDate = easternNow.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
//   return { formattedDate, readableDate };
// };

// const isNBAScheduleRequest = (text) => /nba schedule|nba games|nba scores|nba today|nba yesterday|nba right now|whose winning right now|nba playoffs|nba 2 days ago/i.test(text);
// const detectNBADateOffset = (text) => text.includes("2 days ago") ? -2 : text.includes("yesterday") ? -1 : 0;

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
//     if (events.length === 0) return `No NBA games found for that date.`;

//     const liveGames = [], finalGames = [], scheduledGames = [];
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
//     if (liveGames.length > 0) output += `🔴 LIVE NOW (${liveGames.length}):\n${liveGames.join("\n")}\n\n`;
//     if (finalGames.length > 0) output += `🏁 FINAL SCORES (${finalGames.length}):\n${finalGames.join("\n")}\n\n`;
//     if (scheduledGames.length > 0) output += `🕒 UPCOMING GAMES (${scheduledGames.length}):\n${scheduledGames.join("\n")}`;
//     return output.trim();
//   } catch (error) {
//     console.error("❌ NBA Scoreboard API error:", error);
//     return "Failed to fetch NBA live scores.";
//   }
// };

// const isWeatherRequest = (text) => /(weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i.test(text);
// const extractCity = (text) => text.match(/(?:weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i)?.[1]?.trim();

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
//     const tempF = data.main.temp;
//     const humidity = data.main.humidity;
//     const windSpeedMph = data.wind.speed;
//     return `The current weather in ${data.name}, ${data.sys.country} is ${data.weather[0].description} with a temperature of ${tempF.toFixed(1)}°F, humidity of ${humidity}% and wind speed of ${windSpeedMph.toFixed(1)} mph.`;
//   } catch (error) {
//     console.error("❌ Weather API error:", error);
//     return `Sorry, I couldn't retrieve the weather for "${city}".`;
//   }
// };

// const isNameQuery = (text) => /what('| i)?s your name|who are you|tell me about yourself/i.test(text);
// const isDadJokeRequest = (text) => /(tell me a joke|dad joke|make me laugh|joke|say something funny)/i.test(text);

// const fetchDadJoke = async () => {
//   try {
//     const response = await axios.get("https://dad-jokes-by-api-ninjas.p.rapidapi.com/v1/dadjokes", {
//       headers: {
//         "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
//         "X-RapidAPI-Host": "dad-jokes-by-api-ninjas.p.rapidapi.com",
//       },
//     });
//     return response.data?.[0]?.joke || "Couldn't find a dad joke right now, sorry!";
//   } catch (error) {
//     console.error("❌ Dad Joke API error:", error);
//     return "Failed to fetch a dad joke.";
//   }
// };

// const personalityPrompts = {
//   friendly: "You are Allie, a warm and kind assistant who speaks in a friendly, encouraging tone.",
//   sassy: "You are Allie, a sarcastic, witty assistant who doesn’t hold back and loves throwing playful shade.",
//   motivational: "You are Allie, a high-energy motivational coach who inspires users like a personal hype squad.",
//   humorous: "You are Allie, a clever, funny assistant who always responds with a comedic twist."
// };

// app.post("/api/smart", async (req, res) => {
//   const { prompt, conversationHistory = [], personality, mode } = req.body;
//   const personalityKey = (personality || mode || "friendly").toLowerCase();

//   try {
//     if (/what('| i)?s the time|what('| i)?s the date|current time|current date|local time/i.test(prompt)) {
//       return res.json({ result: await fetchLocalTimeByIP() });
//     }

//     if (isWeatherRequest(prompt)) {
//       const city = extractCity(prompt);
//       if (city) return res.json({ result: await fetchWeather(city) });
//     }

//     if (isNameQuery(prompt)) {
//       return res.json({ result: "My name is Allie, short for Artificial Language Learning & Interaction Engine. I’m here to help you with whatever you need!" });
//     }

//     if (isDadJokeRequest(prompt)) {
//       return res.json({ result: await fetchDadJoke() });
//     }

//     if (isNBAScheduleRequest(prompt)) {
//       const offset = detectNBADateOffset(prompt);
//       const { formattedDate, readableDate } = getNBAFormattedDate(offset);
//       const games = await fetchNBAScoreboard(formattedDate);
//       return res.json({ result: `NBA games for ${readableDate}:\n\n${games}` });
//     }

//     const wrapper = personalityPrompts[personalityKey] || personalityPrompts.friendly;

//     const messages = [
//       { role: "system", content: wrapper },
//       ...conversationHistory.map(entry => ({ role: entry.role, content: entry.content })),
//       { role: "user", content: prompt },
//     ];

//     const completion = await openai.chat.completions.create({
//       model: "gpt-4",
//       messages,
//       temperature: 0.8,
//     });

//     res.json({ result: completion.choices[0].message.content.trim() });
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

// // === ✅ Smart Scheduling route ===
// app.post("/api/schedule", async (req, res) => {
//   const { prompt } = req.body;

//   if (!prompt) {
//     return res.status(400).json({ error: "Prompt is required" });
//   }

//   try {
//     // const taskMatch = prompt.match(/remind me to (.+?)(?: at|$)/i);
//     const taskMatch = prompt.match(/(?:remind me to|schedule) (.+?)(?: at|$)/i);
//     const timeMatch = prompt.match(/at ([0-9]{1,2}(?::[0-9]{2})?\s?(?:am|pm)?)/i);
//     const dateMatch = prompt.match(/(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);

//     if (taskMatch && dateMatch) {
//       const task = taskMatch[1].trim();
//       const time = timeMatch ? timeMatch[1].trim() : "No time specified";
//       const date = dateMatch[1].trim();

//       const docRef = await db.collection("schedules").add({
//         task,
//         date,
//         time,
//         createdAt: new Date(),
//       });

//       return res.status(200).json({ message: "Event saved", id: docRef.id });
//     } else if (prompt.toLowerCase().includes("what") && prompt.toLowerCase().includes("schedule")) {
//       const snapshot = await db.collection("schedules").orderBy("createdAt", "desc").get();
//       const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//       return res.status(200).json({ events });
//     } else {
//       return res.status(200).json({ message: "Could not parse scheduling command" });
//     }
//   } catch (error) {
//     console.error("Schedule API error:", error);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });

// // === Start Server ===
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
// const db = require("./config/firebaseAdmin.js"); // ✅ Firestore initialization

// dotenv.config();
// const app = express();
// const PORT = process.env.PORT || 5000;

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// app.use(cors());
// app.use(express.json());

// // --- Utility Functions ---
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

// const getNBAFormattedDate = (offsetDays = 0) => {
//   const easternNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
//   easternNow.setDate(easternNow.getDate() + offsetDays);
//   const formattedDate = `${easternNow.getFullYear()}${(easternNow.getMonth() + 1).toString().padStart(2, "0")}${easternNow.getDate().toString().padStart(2, "0")}`;
//   const readableDate = easternNow.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
//   return { formattedDate, readableDate };
// };

// const isNBAScheduleRequest = (text) => /nba schedule|nba games|nba scores|nba today|nba yesterday|nba right now|whose winning right now|nba playoffs|nba 2 days ago/i.test(text);
// const detectNBADateOffset = (text) => text.includes("2 days ago") ? -2 : text.includes("yesterday") ? -1 : 0;

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
//     if (events.length === 0) return `No NBA games found for that date.`;

//     const liveGames = [], finalGames = [], scheduledGames = [];
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
//     if (liveGames.length > 0) output += `🔴 LIVE NOW (${liveGames.length}):\n${liveGames.join("\n")}\n\n`;
//     if (finalGames.length > 0) output += `🏁 FINAL SCORES (${finalGames.length}):\n${finalGames.join("\n")}\n\n`;
//     if (scheduledGames.length > 0) output += `🕒 UPCOMING GAMES (${scheduledGames.length}):\n${scheduledGames.join("\n")}`;
//     return output.trim();
//   } catch (error) {
//     console.error("❌ NBA Scoreboard API error:", error);
//     return "Failed to fetch NBA live scores.";
//   }
// };

// const isWeatherRequest = (text) => /(weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i.test(text);
// const extractCity = (text) => text.match(/(?:weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i)?.[1]?.trim();

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
//     const tempF = data.main.temp;
//     const humidity = data.main.humidity;
//     const windSpeedMph = data.wind.speed;
//     return `The current weather in ${data.name}, ${data.sys.country} is ${data.weather[0].description} with a temperature of ${tempF.toFixed(1)}°F, humidity of ${humidity}% and wind speed of ${windSpeedMph.toFixed(1)} mph.`;
//   } catch (error) {
//     console.error("❌ Weather API error:", error);
//     return `Sorry, I couldn't retrieve the weather for "${city}".`;
//   }
// };

// const isNameQuery = (text) => /what('| i)?s your name|who are you|tell me about yourself/i.test(text);
// const isDadJokeRequest = (text) => /(tell me a joke|dad joke|make me laugh|joke|say something funny)/i.test(text);

// const fetchDadJoke = async () => {
//   try {
//     const response = await axios.get("https://dad-jokes-by-api-ninjas.p.rapidapi.com/v1/dadjokes", {
//       headers: {
//         "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
//         "X-RapidAPI-Host": "dad-jokes-by-api-ninjas.p.rapidapi.com",
//       },
//     });
//     return response.data?.[0]?.joke || "Couldn't find a dad joke right now, sorry!";
//   } catch (error) {
//     console.error("❌ Dad Joke API error:", error);
//     return "Failed to fetch a dad joke.";
//   }
// };

// const personalityPrompts = {
//   friendly: "You are Allie, a warm and kind assistant who speaks in a friendly, encouraging tone.",
//   sassy: "You are Allie, a sarcastic, witty assistant who doesn’t hold back and loves throwing playful shade.",
//   motivational: "You are Allie, a high-energy motivational coach who inspires users like a personal hype squad.",
//   humorous: "You are Allie, a clever, funny assistant who always responds with a comedic twist."
// };

// app.post("/api/smart", async (req, res) => {
//   const { prompt, conversationHistory = [], personality, mode } = req.body;
//   const personalityKey = (personality || mode || "friendly").toLowerCase();

//   try {
//     if (/what('| i)?s the time|what('| i)?s the date|current time|current date|local time/i.test(prompt)) {
//       return res.json({ result: await fetchLocalTimeByIP() });
//     }

//     if (isWeatherRequest(prompt)) {
//       const city = extractCity(prompt);
//       if (city) return res.json({ result: await fetchWeather(city) });
//     }

//     if (isNameQuery(prompt)) {
//       return res.json({ result: "My name is Allie, short for Artificial Language Learning & Interaction Engine. I’m here to help you with whatever you need!" });
//     }

//     if (isDadJokeRequest(prompt)) {
//       return res.json({ result: await fetchDadJoke() });
//     }

//     if (isNBAScheduleRequest(prompt)) {
//       const offset = detectNBADateOffset(prompt);
//       const { formattedDate, readableDate } = getNBAFormattedDate(offset);
//       const games = await fetchNBAScoreboard(formattedDate);
//       return res.json({ result: `NBA games for ${readableDate}:\n\n${games}` });
//     }

//     const wrapper = personalityPrompts[personalityKey] || personalityPrompts.friendly;

//     const messages = [
//       { role: "system", content: wrapper },
//       ...conversationHistory.map(entry => ({ role: entry.role, content: entry.content })),
//       { role: "user", content: prompt },
//     ];

//     const completion = await openai.chat.completions.create({
//       model: "gpt-4",
//       messages,
//       temperature: 0.8,
//     });

//     res.json({ result: completion.choices[0].message.content.trim() });
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

// // === ✅ Smart Scheduling route ===
// app.post("/api/schedule", async (req, res) => {
//   const { prompt } = req.body;

//   if (!prompt) {
//     return res.status(400).json({ error: "Prompt is required" });
//   }

//   try {
//     const taskMatch = prompt.match(/remind me to (.+?) at/i);
//     const timeMatch = prompt.match(/at ([0-9]{1,2}(?::[0-9]{2})?\s?(?:am|pm)?)/i);
//     const dateMatch = prompt.match(/(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);

//     if (taskMatch && timeMatch && dateMatch) {
//       const task = taskMatch[1].trim();
//       const time = timeMatch[1].trim();
//       const date = dateMatch[1].trim();

//       const docRef = await db.collection("schedules").add({
//         task,
//         date,
//         time,
//         createdAt: new Date(),
//       });

//       return res.status(200).json({ message: "Event saved", id: docRef.id });
//     } else if (prompt.toLowerCase().includes("what") && prompt.toLowerCase().includes("schedule")) {
//       const snapshot = await db.collection("schedules").orderBy("createdAt", "desc").get();
//       const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//       return res.status(200).json({ events });
//     } else {
//       return res.status(200).json({ message: "Could not parse scheduling command" });
//     }
//   } catch (error) {
//     console.error("Schedule API error:", error);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });

// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });

//6/28/25
// import db from "./config/firebaseAdmin.js";

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

// // --- Utility Functions ---
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

// const getNBAFormattedDate = (offsetDays = 0) => {
//   const easternNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
//   easternNow.setDate(easternNow.getDate() + offsetDays);
//   const formattedDate = `${easternNow.getFullYear()}${(easternNow.getMonth() + 1).toString().padStart(2, "0")}${easternNow.getDate().toString().padStart(2, "0")}`;
//   const readableDate = easternNow.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
//   return { formattedDate, readableDate };
// };

// const isNBAScheduleRequest = (text) => /nba schedule|nba games|nba scores|nba today|nba yesterday|nba right now|whose winning right now|nba playoffs|nba 2 days ago/i.test(text);
// const detectNBADateOffset = (text) => text.includes("2 days ago") ? -2 : text.includes("yesterday") ? -1 : 0;

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
//     if (events.length === 0) return `No NBA games found for that date.`;

//     const liveGames = [], finalGames = [], scheduledGames = [];
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
//     if (liveGames.length > 0) output += `🔴 LIVE NOW (${liveGames.length}):\n${liveGames.join("\n")}\n\n`;
//     if (finalGames.length > 0) output += `🏁 FINAL SCORES (${finalGames.length}):\n${finalGames.join("\n")}\n\n`;
//     if (scheduledGames.length > 0) output += `🕒 UPCOMING GAMES (${scheduledGames.length}):\n${scheduledGames.join("\n")}`;
//     return output.trim();
//   } catch (error) {
//     console.error("❌ NBA Scoreboard API error:", error);
//     return "Failed to fetch NBA live scores.";
//   }
// };

// const isWeatherRequest = (text) => /(weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i.test(text);
// const extractCity = (text) => text.match(/(?:weather|temperature|degrees|hot|cold|warm|rain|raining|snow|snowing) in ([a-zA-Z\s,]+)/i)?.[1]?.trim();

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
//     const tempF = data.main.temp;
//     const humidity = data.main.humidity;
//     const windSpeedMph = data.wind.speed;
//     return `The current weather in ${data.name}, ${data.sys.country} is ${data.weather[0].description} with a temperature of ${tempF.toFixed(1)}°F, humidity of ${humidity}% and wind speed of ${windSpeedMph.toFixed(1)} mph.`;
//   } catch (error) {
//     console.error("❌ Weather API error:", error);
//     return `Sorry, I couldn't retrieve the weather for "${city}".`;
//   }
// };

// const isNameQuery = (text) => /what('| i)?s your name|who are you|tell me about yourself/i.test(text);
// const isDadJokeRequest = (text) => /(tell me a joke|dad joke|make me laugh|joke|say something funny)/i.test(text);

// const fetchDadJoke = async () => {
//   try {
//     const response = await axios.get("https://dad-jokes-by-api-ninjas.p.rapidapi.com/v1/dadjokes", {
//       headers: {
//         "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
//         "X-RapidAPI-Host": "dad-jokes-by-api-ninjas.p.rapidapi.com",
//       },
//     });
//     return response.data?.[0]?.joke || "Couldn't find a dad joke right now, sorry!";
//   } catch (error) {
//     console.error("❌ Dad Joke API error:", error);
//     return "Failed to fetch a dad joke.";
//   }
// };

// const personalityPrompts = {
//   friendly: "You are Allie, a warm and kind assistant who speaks in a friendly, encouraging tone.",
//   sassy: "You are Allie, a sarcastic, witty assistant who doesn’t hold back and loves throwing playful shade.",
//   motivational: "You are Allie, a high-energy motivational coach who inspires users like a personal hype squad.",
//   humorous: "You are Allie, a clever, funny assistant who always responds with a comedic twist."
// };

// app.post("/api/smart", async (req, res) => {
//   const { prompt, conversationHistory = [], personality, mode } = req.body;
//   const personalityKey = (personality || mode || "friendly").toLowerCase();

//   try {
//     if (/what('| i)?s the time|what('| i)?s the date|current time|current date|local time/i.test(prompt)) {
//       return res.json({ result: await fetchLocalTimeByIP() });
//     }

//     if (isWeatherRequest(prompt)) {
//       const city = extractCity(prompt);
//       if (city) return res.json({ result: await fetchWeather(city) });
//     }

//     if (isNameQuery(prompt)) {
//       return res.json({ result: "My name is Allie, short for Artificial Language Learning & Interaction Engine. I’m here to help you with whatever you need!" });
//     }

//     if (isDadJokeRequest(prompt)) {
//       return res.json({ result: await fetchDadJoke() });
//     }

//     if (isNBAScheduleRequest(prompt)) {
//       const offset = detectNBADateOffset(prompt);
//       const { formattedDate, readableDate } = getNBAFormattedDate(offset);
//       const games = await fetchNBAScoreboard(formattedDate);
//       return res.json({ result: `NBA games for ${readableDate}:\n\n${games}` });
//     }

//     const wrapper = personalityPrompts[personalityKey] || personalityPrompts.friendly;

//     const messages = [
//       { role: "system", content: wrapper },
//       ...conversationHistory.map(entry => ({ role: entry.role, content: entry.content })),
//       { role: "user", content: prompt },
//     ];

//     const completion = await openai.chat.completions.create({
//       model: "gpt-4",
//       messages,
//       temperature: 0.8,
//     });

//     res.json({ result: completion.choices[0].message.content.trim() });
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
