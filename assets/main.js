
const COORDS = CONFIG.map.coords;
const ZIPS = Object.keys(COORDS);

let caseRows = [];
let dailyCounts = [];
let cumByDay = [];
let lastCaseDay = [];
let vegaView = null;
let currentDay = 0;
let timer = null;

const isoDay = i => dailyCounts[i].date;

function getTimeZoneOffsetMinutes(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = dtf.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  const localMillis = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (localMillis - date.getTime()) / 60000;
}

function parseDateToUtcIso(dateString, timeZone) {
  const [month, day, year] = dateString.split('/').map(Number);
  let utcMillis = Date.UTC(year, month - 1, day, 0, 0, 0);

  for (let i = 0; i < 5; i++) {
    const parts = getTimeZoneFormattedParts(new Date(utcMillis), timeZone);
    const actualLocalMillis = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    const desiredLocalMillis = Date.UTC(year, month - 1, day, 0, 0, 0);
    const diff = desiredLocalMillis - actualLocalMillis;
    if (Math.abs(diff) < 1000) break;
    utcMillis += diff;
  }

  return new Date(utcMillis).toISOString();
}

function getTimeZoneFormattedParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  return dtf.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
}

// ---------- Build the full list of 31 days ----------
function fmt(d) {
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}
const DAYS = [];
for (let i = 0; i < 31; i++) {
  const d = new Date(2026, 0, 1 + i);
  DAYS.push(fmt(d));
}

async function loadCaseData(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load case data: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift()?.split(',').map(h => h.trim().toUpperCase());
  if (!header || header[0] !== 'DATE' || header[1] !== 'ZIPCODE') {
    throw new Error('Expected CSV header: DATE,ZIPCODE');
  }
  return lines.filter(Boolean).map(line => {
    const [date, zip] = line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
    const datetimeUtc = new Date(parseDateToUtcIso(date, CONFIG.timeZone));
    return {
      date,
      zip,
      datetimeUtc
    };
  });
}

async function init() {
  caseRows = await loadCaseData(CONFIG.data.casesCsv);

  const dailyCountMap = {};
  DAYS.forEach(d => dailyCountMap[d] = 0);
  caseRows.forEach(({date}) => {
    dailyCountMap[date] = (dailyCountMap[date] || 0) + 1;
  });

  dailyCounts = DAYS.map(d => ({
    date: new Date(parseDateToUtcIso(d, CONFIG.timeZone)),
    cases: dailyCountMap[d]
  }));

  const running = {};
  ZIPS.forEach(z => running[z] = 0);
  const lastSeen = {};
  ZIPS.forEach(z => lastSeen[z] = null);
  DAYS.forEach((d, i) => {
    caseRows.filter(({date}) => date === d).forEach(({zip}) => {
      running[zip]++;
      lastSeen[zip] = i;
    });
    cumByDay.push({...running});
    lastCaseDay.push({...lastSeen});
  });

  const spec = {
    "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
    "timezone": CONFIG.timeZone,
    "title": {
      "text": CONFIG.chart.title,
      "anchor": "start"
    },
    "width": "container",
    "height": CONFIG.chart.height,
    "config": {
      "view": {"stroke": "transparent"},
      "axisX": {
        "grid": false,
        "domain": false,

      },
      "axisY": {
        "domain": false,
        "grid": true,
        "ticks": false
    
    }
    },
    "datasets": {
      "daily": dailyCounts,
      "ruleData": [{ "date": isoDay(0) }]
    },
    "layer": [
      {
        "data": {"name": "daily"},
        "mark": {"type": "bar", "color": "#4C78A8","width": {"band": 0.7}},
        "params": [
            {
            "name": "hover",
            "select": {
                "type": "point",
                "on": "pointerover",
                "clear": "pointerout"
            },
            "empty": false
            }
        ],
        "encoding": {
            "color": {
                "condition": {"param": "hover", "empty": false, "value": CONFIG.chart.highlightColor},
                "value": CONFIG.chart.primaryColor
                    },
          "x": {"field": "date", "type": "temporal", "title": null, "axis": {"format": "%b %d"}},
          "y": {
            "field": "cases", 
            "type": "quantitative", 
            "title": null,
            "axis": {
                "labelExpr": "datum.value === 0 ? '' : datum.value"
            }
        },
          "tooltip": [
            {"field": "date", "type": "temporal", "title": "Date", "format": "%b %d, %Y"},
            {"field": "cases", "type": "quantitative", "title": "New cases"}
          ]
        }
      },
      {
        "data": {"name": "ruleData"},
        "mark": {"type": "rule", "color": CONFIG.chart.ruleColor, "strokeWidth": 2},
        "encoding": {
          "x": {"field": "date", "type": "temporal"}
        }
      }
    ]
  };

  vegaEmbed("#chart", spec, {actions: false}).then(res => {
    vegaView = res.view;
    updateChartRule(0);
  });

  updateMap(0);
  updateDayLabel(0);
}

init().catch(err => {
  console.error('Failed to initialize case data:', err);
  const chartContainer = document.getElementById('chart');
  if (chartContainer) chartContainer.textContent = 'Unable to load case data.';
});

// ---------- Leaflet bubble map ----------
const mapContainer = document.getElementById("map");
if (mapContainer) {
  mapContainer.style.height = `${CONFIG.map.height}px`;
}
const map = L.map("map").setView([
  CONFIG.map.initialView.lat,
  CONFIG.map.initialView.lng
], CONFIG.map.initialView.zoom);
// Light, low-detail basemap (Esri World Light Gray Canvas)
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
  maxZoom: 16
}).addTo(map);
// thin reference layer with light labels on top of the gray canvas
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 16
}).addTo(map);

// scale bubble area proportional to cumulative case count
function radiusFor(count) {
  return count > 0 ? Math.max(4, Math.sqrt(count) * 6) : 0;
}

// opacity based on days since the most recent case in that ZIP
// 0 days since = full opacity, decaying toward a low floor as it gets older
function opacityFor(daysSince) {
  if (daysSince === null) return 0; // no cases yet
  const floor = 0.12;
  const decay = 0.15; // per day
  return Math.max(floor, 1 - daysSince * decay);
}

const STROKE_COLOR = CONFIG.map.strokeColor;

const circles = {};
ZIPS.forEach(zip => {
  const c = L.circleMarker(COORDS[zip], {
    radius: radiusFor(0),
    color: STROKE_COLOR,
    weight: 2,
    opacity: 1,          // stroke opacity always full
    fillColor: CONFIG.chart.primaryColor,
    fillOpacity: 0
  }).addTo(map);
  c.bindTooltip(`ZIP ${zip}: 0 cumulative cases`);
  circles[zip] = c;
});

function updateMap(dayIndex) {
  const counts = cumByDay[dayIndex];
  const lastDays = lastCaseDay[dayIndex];
  ZIPS.forEach(zip => {
    const n = counts[zip] || 0;
    const last = lastDays[zip];
    const daysSince = last === null ? null : dayIndex - last;
    circles[zip].setRadius(radiusFor(n));
    circles[zip].setStyle({ fillOpacity: opacityFor(daysSince) });
    const sinceText = daysSince === null ? "no cases yet" : `last case ${daysSince} day${daysSince === 1 ? "" : "s"} ago`;
    circles[zip].setTooltipContent(`ZIP ${zip}: ${n} cumulative cases (${sinceText})`);
  });
}

function updateChartRule(dayIndex) {
  if (!vegaView) return;
  vegaView.data("ruleData", [{ date: isoDay(dayIndex) }]);
  vegaView.runAsync();
}

function updateDayLabel(dayIndex) {
  document.getElementById("dayLabel").textContent = DAYS[dayIndex];
}

// ---------- Play / Reset controls ----------
const playBtn = document.getElementById("playBtn");
const resetBtn = document.getElementById("resetBtn");

function stepForward() {
  if (currentDay >= DAYS.length - 1) {
    clearInterval(timer);
    timer = null;
    playBtn.textContent = "Play";
    return;
  }
  currentDay++;
  updateMap(currentDay);
  updateChartRule(currentDay);
  updateDayLabel(currentDay);
}

playBtn.addEventListener("click", () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
    playBtn.textContent = "Play";
  } else {
    playBtn.textContent = "Pause";
    timer = setInterval(stepForward, CONFIG.playback.intervalMs);
  }
});

resetBtn.addEventListener("click", () => {
  clearInterval(timer);
  timer = null;
  playBtn.textContent = "Play";
  currentDay = 0;
  updateMap(0);
  updateChartRule(0);
  updateDayLabel(0);
});