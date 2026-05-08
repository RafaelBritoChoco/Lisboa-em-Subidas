const https = require('https');

https.get('https://router.project-osrm.org/route/v1/foot/-9.1365919,38.7077507;-9.1334762,38.7139092?overview=full&geometries=geojson', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data.substring(0, 200)));
});
