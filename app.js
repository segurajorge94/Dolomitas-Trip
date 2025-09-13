
/* Improved KML loader & mapper with list toggle, Maps links, and robust search */
const DAY_COLORS = {1:'#ff4d4f',2:'#2f54eb',3:'#52c41a',4:'#722ed1',5:'#fa8c16',6:'#13c2c2'};

let map = L.map('map');
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);

const allLayers = L.layerGroup().addTo(map);
const markers = []; // {name, nameNorm, lat, lon, day, marker}
const lines = [];   // {day, poly, bounds}
const groups = {};  // day -> bounds

let currentDay = null;   // null = all
let currentQuery = '';   // normalized

function norm(s){ return (s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,''); }

function parseDayFromContext(node){
  while(node){
    if(node.tagName==='Folder'||node.tagName==='Document'){
      const nameEl=node.querySelector(':scope > name');
      if(nameEl){
        const name=nameEl.textContent;
        const m = name.match(/(?:d[ií]a|day)\s*(\d+)/i) || name.match(/\b(\d)\b/);
        if(m) return parseInt(m[1],10);
      }
    }
    node=node.parentElement;
  }
  return null;
}
function colorForDay(d){ return DAY_COLORS[d]||'#ffd54f'; }
function makeSvgIcon(color){
  const svg=encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 48'><path d='M16 0C7.2 0 0 7.2 0 16c0 12 16 32 16 32s16-20 16-32C32 7.2 24.8 0 16 0z' fill='${color}'/><circle cx='16' cy='16' r='6' fill='white'/></svg>`);
  return L.icon({iconUrl:'data:image/svg+xml;charset=UTF-8,'+svg,iconSize:[28,42],iconAnchor:[14,40],popupAnchor:[0,-34]});
}

async function loadKML(){
  const res=await fetch('assets/dolomitas.kml');
  const txt=await res.text();
  const xml=new DOMParser().parseFromString(txt,'text/xml');
  const doc=xml.documentElement;
  const placemarks=[...doc.getElementsByTagName('Placemark')];

  placemarks.forEach(pm=>{
    const title=pm.querySelector('name')?.textContent||'Sin nombre';
    const desc=pm.querySelector('description')?.textContent||'';
    const day=parseDayFromContext(pm)||0;

    const point=pm.querySelector('Point > coordinates');
    if(point){
      const [lon,lat]=point.textContent.trim().split(/,\s*/).map(Number);
      const icon=makeSvgIcon(colorForDay(day));
      const gmaps=`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
      const popupHtml=`<b>${title}</b><br>${desc}<br><br><a href="${gmaps}" target="_blank" rel="noopener">🧭 Abrir en Google Maps</a>`;
      const m=L.marker([lat,lon],{icon}).bindPopup(popupHtml);
      markers.push({name:title,nameNorm:norm(title),lat,lon,day,marker:m});
      if(!groups[day]) groups[day]=L.latLngBounds();
      groups[day].extend([lat,lon]);
    }

    const line=pm.querySelector('LineString > coordinates');
    if(line){
      const coords=line.textContent.trim().split(/\s+/).map(p=>{const [lon,lat]=p.split(',').map(Number);return [lat,lon];});
      const poly=L.polyline(coords,{color:colorForDay(day),weight:3,opacity:0.9});
      const b=L.latLngBounds(coords);
      lines.push({day,poly,bounds:b});
      if(!groups[day]) groups[day]=L.latLngBounds();
      groups[day].extend(b);
    }
  });

  render();
  buildControls();
}

function getFilteredMarkers(){
  const q=currentQuery;
  return markers.filter(o => (currentDay==null || o.day===currentDay) && (!q || o.nameNorm.includes(q)));
}
function getFilteredLines(){ return lines.filter(o => (currentDay==null || o.day===currentDay)); }

function render(){
  allLayers.clearLayers();
  const mks=getFilteredMarkers();
  const lns=getFilteredLines();
  lns.forEach(o=>o.poly.addTo(allLayers));
  mks.forEach(o=>o.marker.addTo(allLayers));
  const b=L.latLngBounds();
  if(lns.length) lns.forEach(o=>b.extend(o.bounds));
  mks.forEach(o=>b.extend([o.lat,o.lon]));
  if(b.isValid()) map.fitBounds(b,{padding:[30,30]});
}

function buildControls(){
  const chips=document.getElementById('chips');
  const legend=document.getElementById('legend');
  const list=document.getElementById('list');
  const uniqueDays=Object.keys(groups).map(n=>parseInt(n,10)).sort((a,b)=>a-b);

  chips.innerHTML='';
  const allChip=document.createElement('div');allChip.className='chip';allChip.textContent='Todos';
  allChip.addEventListener('click',()=>{currentDay=null;chips.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));allChip.classList.add('active');render();rebuildList();});
  chips.appendChild(allChip);
  uniqueDays.forEach(d=>{
    const c=document.createElement('div');c.className='chip';c.textContent=`Día ${d}`;
    c.style.boxShadow=`inset 0 0 0 1px ${colorForDay(d)}`;
    c.addEventListener('click',()=>{currentDay=d;chips.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));c.classList.add('active');render();rebuildList();});
    chips.appendChild(c);
  });

  legend.innerHTML='';
  uniqueDays.forEach(d=>{
    const badge=document.createElement('div');badge.className='badge';
    badge.innerHTML=`<span class="dot" style="background:${colorForDay(d)}"></span>Día ${d}`;
    legend.appendChild(badge);
  });

  function gmapsLink(lat,lon){return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;}
  function rebuildList(){
    const items=getFilteredMarkers();
    const frag=document.createDocumentFragment();
    let lastDay=null;
    items.sort((a,b)=> (a.day-b.day)||a.name.localeCompare(b.name));
    items.forEach(o=>{
      if(o.day!==lastDay){
        const header=document.createElement('div');header.className='stop';header.style.background='#141414';header.innerHTML=`<b>Día ${o.day}</b>`;frag.appendChild(header);lastDay=o.day;
      }
      const div=document.createElement('div');div.className='stop';
      div.innerHTML=`
        ${o.name}
        <small>${o.lat.toFixed(5)}, ${o.lon.toFixed(5)}</small>
        <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" data-act="center">Centrar</button>
          <a class="btn" href="${gmapsLink(o.lat,o.lon)}" target="_blank" rel="noopener">🧭 Google Maps</a>
        </div>`;
      div.querySelector('[data-act="center"]').addEventListener('click',()=>{map.setView([o.lat,o.lon],14);o.marker.openPopup();});
      frag.appendChild(div);
    });
    list.innerHTML='';list.appendChild(frag);
  }
  window.rebuildList=rebuildList;
  rebuildList();
}

// Controls
document.getElementById('resetBtn').addEventListener('click',()=>{
  currentDay=null;currentQuery='';document.getElementById('search').value='';render();window.rebuildList();
});
document.getElementById('listToggleBtn').addEventListener('click',()=>{
  document.getElementById('sidebar').classList.toggle('hidden');
});
function applySearch(){ currentQuery=norm(document.getElementById('search').value); render(); window.rebuildList(); }
document.getElementById('search').addEventListener('input',applySearch);
document.getElementById('clearBtn').addEventListener('click',()=>{ document.getElementById('search').value=''; currentQuery=''; render(); window.rebuildList(); });
document.getElementById('locateBtn').addEventListener('click',()=>{
  if(!navigator.geolocation) return alert('Geolocalización no disponible');
  navigator.geolocation.getCurrentPosition(pos=>{
    const {latitude,longitude}=pos.coords;
    L.marker([latitude,longitude]).addTo(allLayers).bindPopup('Estás aquí').openPopup();
    map.setView([latitude,longitude],13);
  },err=>alert('No se pudo obtener ubicación: '+err.message),{enableHighAccuracy:true,timeout:8000});
});

map.setView([46.56,11.95],9);
loadKML();
