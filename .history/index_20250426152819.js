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
