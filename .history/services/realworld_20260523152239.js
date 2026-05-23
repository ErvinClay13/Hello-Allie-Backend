const axios = require("axios");

const intents = {
  time:      function(t) { return /what.s (the )?(time|date)|current (time|date)|local time|what day is it/i.test(t); },
  weather:   function(t) { return /(weather|temperature|degrees|how (hot|cold|warm)|rain|raining|snow|snowing).{0,30}\bin\b/i.test(t); },
  nba:       function(t) { return /\bnba\b|basketball score|lakers|celtics|warriors|bulls|heat|knicks|nets|bucks|sixers|suns|nuggets|clippers|mavericks|mavs|spurs|rockets|hawks|hornets|pistons|pacers|magic|wizards|raptors|cavaliers|cavs|blazers|thunder|grizzlies|pelicans|jazz|timberwolves|kings/i.test(t); },
  nfl:       function(t) { return /\bnfl\b|football score|chiefs|eagles|cowboys|patriots|packers|49ers|niners|ravens|bengals|bills|dolphins|jets|giants|commanders|bears|lions|vikings|seahawks|rams|cardinals|falcons|panthers|saints|buccaneers|bucs|broncos|raiders|chargers|steelers|browns|colts|titans|jaguars|texans/i.test(t); },
  mlb:       function(t) { return /\bmlb\b|baseball score|yankees|mets|red sox|dodgers|cubs|white sox|braves|astros|nationals|cardinals|brewers|reds|pirates|phillies|marlins|rockies|padres|giants|angels|athletics|mariners|rangers|twins|tigers|guardians|royals|orioles|rays|blue jays/i.test(t); },
  nhl:       function(t) { return /\bnhl\b|hockey score|bruins|maple leafs|canadiens|rangers|islanders|devils|flyers|penguins|capitals|hurricanes|panthers|lightning|red wings|blackhawks|blues|predators|avalanche|coyotes|ducks|kings|sharks|golden knights|kraken|senators|sabres|canucks|flames|oilers|jets|wild/i.test(t); },
  ncaafb:    function(t) { return /college football|ncaa football|cfb score|alabama|ohio state|georgia|michigan|clemson|notre dame|oklahoma|lsu|florida|texas|penn state|oregon|usc trojans/i.test(t); },
  mls:       function(t) { return /\bmls\b|soccer score|major league soccer|galaxy|sounders|portland timbers|atlanta united|inter miami|red bulls|fire|crew|sporting kc|minnesota united/i.test(t); },
  sports:    function(t) { return /score|who won|game (today|tonight|yesterday|last night)|last night.{0,15}game|game.{0,15}last night|sports (score|update|result)/i.test(t); },
  news:      function(t) { return /what.s (in the news|happening (today|right now|in the world)|the latest)|top (news|headlines|stories)/i.test(t); },
  wikipedia: function(t) { return /^who (is|was) |^what is |^tell me about |^explain /i.test(t); },
  search:    function(t) { return /latest|current|right now|as of today|just happened|recently/i.test(t); },
  name:      function(t) { return /what.s your name|who are you|tell me about yourself/i.test(t); },
  joke:      function(t) { return /tell me a joke|dad joke|make me laugh|say something funny/i.test(t); },
};

const extractCity = function(text) {
  var match = text.match(/(?:weather|temperature|degrees|hot|cold|warm|rain|snow).{0,20}\bin\b ([a-zA-Z\s,]+)/i);
  return match ? match[1].trim() : null;
};

const detectNBAOffset = function(text) {
  if (/2 days? ago/i.test(text)) return -2;
  if (/yesterday|last night/i.test(text)) return -1;
  return 0;
};

function getCurrentDateTimeContext() {
  var now = new Date();
  var dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  var timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  return "Today is " + dateStr + ". The current time is " + timeStr + ".";
}

async function fetchLocalTime() {
  try {
    var res = await axios.get("https://api.ipgeolocation.io/timezone?apiKey=" + process.env.IPGEOLOCATION_API_KEY);
    var d = res.data;
    return "The current local time is " + d.date_time_txt + " in " + (d.geo && d.geo.city) + ", " + (d.geo && d.geo.country_name) + " (" + d.timezone + ").";
  } catch(e) {
    return getCurrentDateTimeContext();
  }
}

async function fetchWeather(city) {
  try {
    var res = await axios.get("https://api.openweathermap.org/data/2.5/weather", {
      params: { q: city, appid: process.env.OPENWEATHER_API_KEY, units: "imperial" }
    });
    var d = res.data;
    var desc = d.weather[0].description;
    var tempF = d.main.temp.toFixed(1);
    var tempC = ((d.main.temp - 32) * 5 / 9).toFixed(1);
    return "Current weather in " + d.name + ", " + d.sys.country + ": " + desc + ", " + tempF + "F (" + tempC + "C), humidity " + d.main.humidity + "%, wind " + d.wind.speed.toFixed(1) + " mph.";
  } catch(err) {
    console.error("Weather API error:", err && err.message);
    return "Sorry, I couldn't get the weather for " + city + " right now.";
  }
}

function getESPNDate(offsetDays) {
  offsetDays = offsetDays || 0;
  var d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  d.setDate(d.getDate() + offsetDays);
  var pad = function(n) { return String(n).padStart(2, "0"); };
  return {
    formatted: d.getFullYear() + "" + pad(d.getMonth() + 1) + "" + pad(d.getDate()),
    readable: d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
  };
}

async function fetchESPNScores(sport, league, offsetDays) {
  try {
    var dateInfo = getESPNDate(offsetDays || 0);
    var res = await axios.get(
      "https://site.api.espn.com/apis/site/v2/sports/" + sport + "/" + league + "/scoreboard",
      { params: { dates: dateInfo.formatted }, timeout: 8000 }
    );
    var events = (res.data && res.data.events) || [];
    if (!events.length) return "No " + league.toUpperCase() + " games found for " + dateInfo.readable + ".";

    var live = [], final = [], upcoming = [];
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      var comp = e.competitions && e.competitions[0];
      var teams = (comp && comp.competitors) || [];
      var home = teams.find(function(t) { return t.homeAway === "home"; });
      var away = teams.find(function(t) { return t.homeAway === "away"; });
      var state = (comp && comp.status && comp.status.type && comp.status.type.state) || "";
      var awayName = (away && away.team && (away.team.shortDisplayName || away.team.displayName)) || "Away";
      var homeName = (home && home.team && (home.team.shortDisplayName || home.team.displayName)) || "Home";
      var awayScore = (away && away.score) != null ? away.score : "-";
      var homeScore = (home && home.score) != null ? home.score : "-";
      var line = awayName + " " + awayScore + " - " + homeScore + " " + homeName;

      if (state === "in") {
        var clock = (comp && comp.status && comp.status.displayClock) || "";
        var period = (comp && comp.status && comp.status.period) || "";
        line += " (LIVE - Period " + period + " " + clock + ")";
        live.push(line);
      } else if (state === "post") {
        line += " (Final)";
        final.push(line);
      } else {
        var gameTime = e.date ? new Date(e.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" }) : "";
        line += gameTime ? " (" + gameTime + " ET)" : " (Scheduled)";
        upcoming.push(line);
      }
    }

    var leagueName = league.toUpperCase().replace("COLLEGE-FOOTBALL", "College Football").replace("USA.1", "MLS");
    var out = leagueName + " scores for " + dateInfo.readable + ":";
    if (live.length)     out += "\nLIVE NOW:\n" + live.join("\n");
    if (final.length)    out += "\nFinal Results:\n" + final.join("\n");
    if (upcoming.length) out += "\nUpcoming:\n" + upcoming.join("\n");
    return out;
  } catch(err) {
    console.error("ESPN " + league + " error:", err && err.message);
    return "Sorry, I couldn't fetch " + league.toUpperCase() + " scores right now.";
  }
}

async function fetchNBAScores(offsetDays)    { return fetchESPNScores("basketball", "nba",              offsetDays); }
async function fetchNFLScores(offsetDays)    { return fetchESPNScores("football",   "nfl",              offsetDays); }
async function fetchMLBScores(offsetDays)    { return fetchESPNScores("baseball",   "mlb",              offsetDays); }
async function fetchNHLScores(offsetDays)    { return fetchESPNScores("hockey",     "nhl",              offsetDays); }
async function fetchNCAAFBScores(offsetDays) { return fetchESPNScores("football",   "college-football", offsetDays); }
async function fetchMLSScores(offsetDays)    { return fetchESPNScores("soccer",     "usa.1",            offsetDays); }

async function fetchNews() {
  try {
    var res = await axios.get("https://gnews.io/api/v4/top-headlines", {
      params: { token: process.env.GNEWS_API_KEY, lang: "en", country: "us", max: 5 }
    });
    var articles = (res.data && res.data.articles) || [];
    if (!articles.length) return "No news headlines available right now.";
    var headlines = articles.map(function(a, i) { return (i + 1) + ". " + a.title + " (" + a.source.name + ")"; }).join("\n");
    return "Here are today's top news headlines:\n" + headlines;
  } catch(err) {
    console.error("News API error:", err && err.message);
    return "Sorry, I couldn't fetch the news right now.";
  }
}

async function fetchWikipedia(query) {
  try {
    var searchTerm = query.replace(/^(who is|who was|what is|tell me about|explain)\s*/i, "").trim();
    var res = await axios.get("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(searchTerm));
    var d = res.data;
    if (d.type === "disambiguation") return searchTerm + " could mean several things. Can you be more specific?";
    return d.extract ? "Here's what I know about " + d.title + ": " + d.extract.slice(0, 600) + "..." : null;
  } catch(e) {
    return null;
  }
}

async function fetchWebSearch(query) {
  if (process.env.TAVILY_API_KEY) {
    try {
      var res = await axios.post("https://api.tavily.com/search", {
        api_key: process.env.TAVILY_API_KEY, query: query, search_depth: "basic", max_results: 3
      });
      var results = (res.data && res.data.results) || [];
      if (!results.length) return null;
      return "Web search results for " + query + ":\n" +
        results.map(function(r, i) { return (i+1) + ". " + r.title + ": " + (r.content || "").slice(0, 200); }).join("\n");
    } catch(err) {
      console.error("Tavily error:", err && err.message);
    }
  }
  if (process.env.BRAVE_SEARCH_API_KEY) {
    try {
      var res2 = await axios.get("https://api.search.brave.com/res/v1/web/search", {
        params: { q: query, count: 3 },
        headers: { "Accept": "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY }
      });
      var results2 = (res2.data && res2.data.web && res2.data.web.results) || [];
      if (!results2.length) return null;
      return "Web search results for " + query + ":\n" +
        results2.map(function(r, i) { return (i+1) + ". " + r.title + ": " + (r.description || "").slice(0, 200); }).join("\n");
    } catch(err) {
      console.error("Brave error:", err && err.message);
    }
  }
  return null;
}

async function fetchDadJoke() {
  try {
    var res = await axios.get("https://icanhazdadjoke.com/", { headers: { Accept: "application/json" } });
    return (res.data && res.data.joke) || "Why don't scientists trust atoms? Because they make up everything!";
  } catch(e) {
    return "Why don't scientists trust atoms? Because they make up everything!";
  }
}

module.exports = {
  intents, extractCity, detectNBAOffset, getCurrentDateTimeContext,
  fetchLocalTime, fetchWeather,
  fetchNBAScores, fetchNFLScores, fetchMLBScores, fetchNHLScores, fetchNCAAFBScores, fetchMLSScores, fetchESPNScores,
  fetchNews, fetchWikipedia, fetchWebSearch, fetchDadJoke,
};