#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const apiKey = process.env.OPENWEATHER_API_KEY;
if (!apiKey) {
  console.error('Missing OPENWEATHER_API_KEY');
  process.exit(1);
}

const lat = 51.52000833497528;
const lon = -0.21052808674644183;
const url =
  `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}` +
  `&lon=${lon}&exclude=minutely,hourly,alerts&units=metric&appid=${apiKey}`;

async function main() {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OpenWeather error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const payload = {
    daily: [
      {
        temp: { max: data?.daily?.[0]?.temp?.max ?? null },
        weather: [{ main: data?.daily?.[0]?.weather?.[0]?.main ?? '' }]
      }
    ],
    updated_at: new Date().toISOString()
  };
  const outPath = path.join(__dirname, '..', 'public', 'weather.json');
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
