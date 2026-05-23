// services/realworld.js
const axios = require("axios");
 
// ── INTENT DETECTORS ─────────────────────────────────────────────────────────
const intents = {
  time:      (t) => /what.s (the )?(time|date)|current (time|date)|local time|what day is it/i.test(t),
  weather:   (t) => /(weather|temperature|degrees|how (hot|cold|warm)|rain|raining|snow|snowing).{0,30}\bin\b/i.test(t),
  nba:       (t) => /\bnba\b|basketball score|last night.{0,15}game|game.{0,15}last night|who won.{0,20}game|lakers|celtics|warriors|bulls|heat|knicks|nets|bucks|sixers|suns|nuggets|clippers|mavericks|mavs|spurs|rockets|hawks|hornets|pistons|pacers|magic|wizards|raptors|cavaliers|cavs|blazers|thunder|grizzlies|pelicans|jazz|timberwolves|kings/i.test(t),
  news:      (t) => /what.s (in the news|happening (today|right now|in the world)|the latest)|top (news|headlines|stories)/i.test(t),
  wikipedia: (t) => /^who (is|was) |^what is |^tell me about |^explain /i.test(t),
  search:    (t) => /latest|current|right now|as of today|just happened|recently/i.test(t),
  name:      (t) => /what.s your name|who are you|tell me about yourself/i.test(t),
  joke:      (t) => /tell me a joke|dad joke|make me laugh|say something funny/i.test(t),
};
 
const extractCity = (text) =>
  text.match(/(?:weather|temperature|degrees|hot|cold|warm|rain|snow).{0,20}\bin\b ([a-zA-Z\s,]+)/i)?.[1]?.trim();
 
const detectNBAOffset = (text) =>
  /2 days? ago/i.test(text)          ? -2 :
  /yesterday|last night/i.test(text) ? -1 : 0;
 
// ── DATE / TIME ───────────────────────────────────────────────────────────────
function getCurrentDateTimeContext() {
  const now = new Date();
  return `Today is ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}. The current time is ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}.`;
}
 
// ── LOCAL TIME BY IP ──────────────────────────────────────────────────────────
async function fetchLocalTime() {
  try {
    const { data } = await axios.get(
      `https://api.ipgeolocation.io/timezone?apiKey=${process.env.IPGEOLOCATION_API_KEY}`
    );
    return `The current local time is ${data.date_time_txt} in ${data.geo?.city}, ${data.geo?.country_name} (${data.timezone}).`;
  } catch {
    return getCurrentDateTimeContext();
  }
}
 
// ── WEATHER ───────────────────────────────────────────────────────────────────
async function fetchWeather(city) {
  try {
    const { data } = await axios.get("https://api.openweathermap.org/data/2.5/weather", {
      params: {
        q:     city,
        appid: process.env.OPENWEATHER_API_KEY,
        units: "imperial",
      },
    });
    const desc    = data.weather[0].description;
    const tempF   = data.main.temp.toFixed(1);
    const tempC   = ((data.main.temp - 32) * 5 / 9).toFixed(1);
    const humid   = data.main.humidity;
    const wind    = data.wind.speed.toFixed(1);
    const name    = data.name;
    const country = data.sys.country;
    return `Current weather in ${name}, ${country}: ${desc}, ${tempF}°F (${tempC}°C), humidity ${humid}%, wind ${wind} mph.`;
  } catch (err) {
    console.error("Weather API error:", err?.response?.data || err.message);
    return `Sorry, I couldn't get the weather for "${city}" right now.`;
  }
}
 
// ── NBA SCORES — uses free ESPN API (no key needed) ───────────────────────────
function getNBADateESPN(offsetDays = 0) {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  d.setDate(d.getDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    formatted: `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`,
    readable:  d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
  };
}
 
async function fetchNBAScores(offsetDays = 0) {
  try {
    const { formatted, readable } = getNBADateESPN(offsetDays);
 
    const { data } = await axios.get(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard`,
      { params: { dates: formatted }, timeout: 8000 }
    );
 
    const events = data?.events || [];
    if (!events.length) return `No NBA games found for ${readable}.`;
 
    const live = [], final = [], upcoming = [];
 
    for (const e of events) {
      const comp   = e.competitions?.[0];
      const teams  = comp?.competitors || [];
      const home   = teams.find((t) => t.homeAway === "home");
      const away   = teams.find((t) => t.homeAway === "away");
      const status = comp?.status?.type?.name || "";
      const state  = comp?.status?.type?.state || "";
 
      const awayName  = away?.team?.shortDisplayName || away?.team?.displayName || "Away";
      const homeName  = home?.team?.shortDisplayName || home?.team?.displayName || "Home";
      const awayScore = away?.score ?? "-";
      const homeScore = home?.score ?? "-";
 
      let line = `${awayName} ${awayScore} - ${homeScore} ${homeName}`;
 
      if (state === "in") {
        const clock  = comp?.status?.displayClock || "";
        const period = comp?.status?.period || "";
        line += ` (LIVE - Q${period} ${clock})`;
        live.push(line);
      } else if (state === "post") {
        line += " (Final)";
        final.push(line);
      } else {
        const gameTime = e.date ? new Date(e.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" }) : "";
        line += gameTime ? ` (${gameTime} ET)` : " (Scheduled)";
        upcoming.push(line);
      }
    }
 
    let out = `NBA scores for ${readable}:\n`;
    if (live.length)     out += `\nLIVE NOW (${live.length}):\n${live.join("\n")}`;
    if (final.length)    out += `\nFinal Results (${final.length}):\n${final.join("\n")}`;
    if (upcoming.length) out += `\nUpcoming (${upcoming.length}):\n${upcoming.join("\n")}`;
    return out.trim();
 
  } catch (err) {
    console.error("NBA ESPN API error:", err?.response?.status, err?.message);
    return "Sorry, I couldn't fetch NBA scores right now. Try again in a moment.";
  }
}
 
// ── NEWS HEADLINES ────────────────────────────────────────────────────────────
async function fetchNews() {
  try {
    const { data } = await axios.get("https://gnews.io/api/v4/top-headlines", {
      params: {
        token:   process.env.GNEWS_API_KEY,
        lang:    "en",
        country: "us",
        max:     5,
      },
    });
    const articles = data.articles || [];
    if (!articles.length) return "No news headlines available right now.";
    const headlines = articles.map((a, i) => `${i + 1}. ${a.title} (${a.source.name})`).join("\n");
    return `Here are today's top news headlines:\n${headlines}`;
  } catch (err) {
    console.error("News API error:", err?.message);
    return "Sorry, I couldn't fetch the news right now.";
  }
}
 
// ── WIKIPEDIA SUMMARY ─────────────────────────────────────────────────────────
async function fetchWikipedia(query) {
  try {
    const searchTerm = query
      .replace(/^(who is|who was|what is|tell me about|explain)\s*/i, "")
      .trim();
    const { data } = await axios.get(
      "https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(searchTerm)
    );
    if (data.type === "disambiguation") {
      return `"${searchTerm}" could mean several things. Can you be more specific?`;
    }
    return data.extract
      ? `Here's what I know about ${data.title}: ${data.extract.slice(0, 600)}...`
      : null;
  } catch {
    return null;
  }
}
 
// ── WEB SEARCH FALLBACK ───────────────────────────────────────────────────────
async function fetchWebSearch(query) {
  // Tavily — AI-ready summaries, built for this use case
  if (process.env.TAVILY_API_KEY) {
    try {
      const { data } = await axios.post("https://api.tavily.com/search", {
        api_key:      process.env.TAVILY_API_KEY,
        query,
        search_depth: "basic",
        max_results:  3,
      });
      const results = data.results || [];
      if (!results.length) return null;
      return `Web search results for "${query}":\n` +
        results.map((r, i) => `${i + 1}. ${r.title}: ${r.content?.slice(0, 200)}`).join("\n");
    } catch (err) {
      console.error("Tavily error:", err?.message);
    }
  }
 
  // Brave Search fallback
  if (process.env.BRAVE_SEARCH_API_KEY) {
    try {
      const { data } = await axios.get("https://api.search.brave.com/res/v1/web/search", {
        params:  { q: query, count: 3 },
        headers: {
          "Accept":               "application/json",
          "Accept-Encoding":      "gzip",
          "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY,
        },
      });
      const results = data.web?.results || [];
      if (!results.length) return null;
      return `Web search results for "${query}":\n` +
        results.map((r, i) => `${i + 1}. ${r.title}: ${r.description?.slice(0, 200)}`).join("\n");
    } catch (err) {
      console.error("Brave Search error:", err?.message);
    }
  }
 
  return null;
}
 
// ── DAD JOKES ─────────────────────────────────────────────────────────────────
async function fetchDadJoke() {
  try {
    const { data } = await axios.get("https://icanhazdadjoke.com/", {
      headers: { Accept: "application/json" },
    });
    return data?.joke || "Why don't scientists trust atoms? Because they make up everything!";
  } catch {
    return "Why don't scientists trust atoms? Because they make up everything!";
  }
}
 
module.exports = {
  intents,
  extractCity,
  detectNBAOffset,
  getCurrentDateTimeContext,
  fetchLocalTime,
  fetchWeather,
  fetchNBAScores,
  fetchNews,
  fetchWikipedia,
  fetchWebSearch,
  fetchDadJoke,
};
