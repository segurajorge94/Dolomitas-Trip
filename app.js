
/* Simple KML loader & mapper for Dolomites trip */
const DAY_COLORS = {
  1: '#ff4d4f', // red
  2: '#2f54eb', // blue
  3: '#52c41a', // green
  4: '#722ed1', // purple
  5: '#fa8c16', // orange
  6: '#13c2c2', // cyan
};

let map = L.map('map');
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

const allMarkers = [];
const byDay = {}; // day -> { markers:[], lines:[], bounds:LatLngBounds }
const allLayers = L.layerGroup().addTo(map);

function parseDayFromContext(node) {
  // Ascend folders to find a name that includes "Día X" or "Day X" or a number
  while (node) {
    if (node.tagName === 'Folder' || node.tagName === 'Document') {
      const nameEl = node.querySelector(':scope > name');
      if (nameEl) {
        const name = nameEl.textContent;
        const m = name.match(/(?:d[ií]a|day)\s*(\d+)/i) || name.match(/\b(\d)\b/);
        if (m) return parseInt(m[1],10);
      }
    }
    node = node.parentElement;
  }
  return null;
}

function colorForDay(day) {
  return DAY_COLORS[day] || '#ffd54f';
}

function makeSvgIcon(color) {
  const svg = encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 48'>
      <path d='M16 0C7.2 0 0 7.2 0 16c0 12 16 32 16 32s16-20 16-32C32 7.2 24.8 0 16 0z' fill='${color}'/>
      <circle cx='16' cy='16' r='6' fill='white'/>
    </svg>`);
  return L.icon({
    iconUrl: 'data:image/svg+xml;charset=UTF-8,' + svg,
    iconSize: [28, 42],
    iconAnchor: [14, 40],
    popupAnchor: [0, -34]
  });
}

async function loadKML() {
  const res = await fetch('assets/dolomitas.kml');
  const txt = await res.text();
  const xml = new DOMParser().parseFromString(txt, 'text/xml');
  const doc = xml.documentElement;

  const placemarks = Array.from(doc.getElementsByTagName('Placemark'));
  placemarks.forEach(pm => {
    const name = pm.querySelector('name')?.textContent || 'Sin nombre';
    const desc = pm.querySelector('description')?.textContent || '';
    let day = parseDayFromContext(pm) || 0;

    // Point
    const point = pm.querySelector('Point > coordinates');
    if (point) {
      const [lon, lat] = point.textContent.trim().split(/,\s*/).map(Number);
      const marker = L.marker([lat, lon], { icon: makeSvgIcon(colorForDay(day)) })
        .bindPopup(`<b>${name}</b><br>${desc}`);
      marker.addTo(allLayers);
      allMarkers.push({ name, marker, day });
      if (!byDay[day]) byDay[day] = { markers:[], lines:[], bounds: L.latLngBounds() };
      byDay[day].markers.push(marker);
      byDay[day].bounds.extend([lat, lon]);
    }

    // LineString
    const line = pm.querySelector('LineString > coordinates');
    if (line) {
      const coords = line.textContent.trim().split(/\s+/).map(pair => {
        const [lon, lat] = pair.split(',').map(Number);
        return [lat, lon];
      });
      const poly = L.polyline(coords, { color: colorForDay(day), weight: 3, opacity: 0.9 }).addTo(allLayers);
      if (!byDay[day]) byDay[day] = { markers:[], lines:[], bounds: L.latLngBounds() };
      byDay[day].lines.push(poly);
      coords.forEach(c=>byDay[day].bounds.extend(c));
    }
  });

  // Fit bounds
  const allBounds = L.latLngBounds();
  Object.values(byDay).forEach(g => allBounds.extend(g.bounds));
  if (allBounds.isValid()) map.fitBounds(allBounds, { padding: [30,30] });
  buildUI();
}

function buildUI() {
  const chips = document.getElementById('chips');
  const legend = document.getElementById('legend');
  const list = document.getElementById('list');

  // Days present
  const days = Object.keys(byDay).map(n=>parseInt(n,10)).sort((a,b)=>a-b);
  days.forEach(day => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.dataset.day = day;
    chip.textContent = day===0 ? 'Todos' : `Día ${day}`;
    chip.style.borderColor = colorForDay(day);
    chip.style.boxShadow = `inset 0 0 0 1px ${colorForDay(day)}`;
    chips.appendChild(chip);

    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.innerHTML = `<span class="dot" style="background:${colorForDay(day)}"></span>${day===0 ? 'Sin grupo' : 'Día '+day}`;
    legend.appendChild(badge);
  });

  function showDay(day) {
    // Hide all
    allLayers.clearLayers();
    if (byDay[day]) {
      byDay[day].markers.forEach(m=>m.addTo(allLayers));
      byDay[day].lines.forEach(l=>l.addTo(allLayers));
      if (byDay[day].bounds.isValid()) map.fitBounds(byDay[day].bounds, { padding:[30,30] });
    } else {
      // if day doesn't exist, show all
      Object.values(byDay).forEach(g=>{
        g.markers.forEach(m=>m.addTo(allLayers));
        g.lines.forEach(l=>l.addTo(allLayers));
      });
    }
  }

  chips.addEventListener('click', (e)=>{
    const c = e.target.closest('.chip');
    if (!c) return;
    chips.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));
    c.classList.add('active');
    showDay(parseInt(c.dataset.day,10));
  });

  // Build list of stops (markers only), grouped by day
  const frag = document.createDocumentFragment();
  days.forEach(day=>{
    const header = document.createElement('div');
    header.className = 'stop';
    header.innerHTML = `<b>${day===0?'Sin grupo':'Día '+day}</b>`;
    header.style.background = '#141414';
    frag.appendChild(header);
    (byDay[day]?.markers || []).forEach(m=>{
      const div = document.createElement('div');
      div.className = 'stop';
      const nm = m.getPopup()?.getContent()?.toString().split('<br>')[0].replace('<b>','').replace('</b>','') || 'Punto';
      div.innerHTML = `${nm}<small>Pínchame para centrar</small>`;
      div.addEventListener('click', ()=>{
        map.setView(m.getLatLng(), 14);
        m.openPopup();
      });
      frag.appendChild(div);
    });
  });
  list.innerHTML = '';
  list.appendChild(frag);

  // Default: show all
  chips.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));
}

document.getElementById('resetBtn').addEventListener('click', ()=>{
  const bounds = L.latLngBounds();
  Object.values(byDay).forEach(g=>bounds.extend(g.bounds));
  if (bounds.isValid()) map.fitBounds(bounds, { padding:[30,30] });
});

document.getElementById('locateBtn').addEventListener('click', ()=>{
  if (!navigator.geolocation) return alert('Geolocalización no disponible');
  navigator.geolocation.getCurrentPosition(pos=>{
    const { latitude, longitude } = pos.coords;
    L.marker([latitude, longitude]).addTo(map).bindPopup('Estás aquí').openPopup();
    map.setView([latitude, longitude], 13);
  }, err=> alert('No se pudo obtener ubicación: '+err.message), { enableHighAccuracy:true, timeout:8000 });
});

document.getElementById('search').addEventListener('input', (e)=>{
  const q = e.target.value.toLowerCase();
  allMarkers.forEach(({name, marker})=>{
    const match = name.toLowerCase().includes(q);
    if (match) marker.addTo(allLayers); else allLayers.removeLayer(marker);
  });
});

// Init
map.setView([46.56, 11.95], 9);
loadKML();
