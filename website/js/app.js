/* Densco Drain Cleaning & Plumbing - scripts */
document.getElementById('yr').textContent = new Date().getFullYear();

// Footer service-area links also highlight that town on the map
document.querySelectorAll('[data-foot-area]').forEach(function (a) {
  a.addEventListener('click', function () {
    var btn = document.querySelector('.city-list [data-area="' + a.getAttribute('data-foot-area') + '"]');
    if (btn && !btn.classList.contains('on')) btn.click();
  });
});

// Nav underline follows the section in view
(function () {
  var links = document.querySelectorAll('.nav [data-spy]'); if (!links.length || !('IntersectionObserver' in window)) return;
  var map = { top: document.querySelector('.hero') };
  ['services', 'why', 'area', 'reviews', 'contact'].forEach(function (id) { map[id] = document.getElementById(id); });
  function set(id) { links.forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-spy') === id); }); }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { for (var k in map) if (map[k] === e.target) set(k); } });
  }, { rootMargin: '-45% 0px -50% 0px' });
  for (var k in map) if (map[k]) io.observe(map[k]);
  set('top');
})();

// Mobile menu toggle
(function () {
  var btn = document.querySelector('.menu-btn'), nav = document.getElementById('main-nav');
  if (!btn || !nav) return;
  btn.addEventListener('click', function () { var open = nav.classList.toggle('open'); btn.setAttribute('aria-expanded', open); btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); });
  nav.addEventListener('click', function (e) { if (e.target.tagName === 'A') { nav.classList.remove('open'); btn.setAttribute('aria-expanded', false); } });
})();


// ===== Service area map =====
// Paste a Google Maps JavaScript API key here to enable the full Google map
// (Map/Satellite, fullscreen, camera controls and Pegman / Street View).
// Restrict the key to your domain in Google Cloud Console.
// Without a key, a free OpenStreetMap/Esri fallback is used.
var GOOGLE_MAPS_API_KEY = '';

(function () {
  var AREAS = window.DENSCO_AREAS || {};
  var CENTER = window.DENSCO_CENTER || { lat: 40.20636, lng: -74.77865, radiusMiles: 5 };
  var OFFICE = { lat: CENTER.lat, lng: CENTER.lng }; // 223 W Bridge St (Rear Warehouse), Morrisville, PA
  var RADIUS_M = CENTER.radiusMiles * 1609.344;
  var ALL_LABEL = "Within " + CENTER.radiusMiles + " miles of Morrisville, PA";
  // 5-mile circle clipped to Pennsylvania (Bucks County boundary) with Sutherland-Hodgman: the circle is convex, so it works as the clip shape.
  function clipToCircle(subject) {
    var dLat = RADIUS_M / 111320, dLng = RADIUS_M / (111320 * Math.cos(OFFICE.lat * Math.PI / 180)), clip = [], n = 120;
    for (var i = 0; i < n; i++) { var t = 2 * Math.PI * i / n; clip.push([OFFICE.lng + dLng * Math.cos(t), OFFICE.lat + dLat * Math.sin(t)]); }
    if (!subject || subject.length < 3) return clip;
    function inside(p, a, b) { return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0; }
    function cross(p, q, a, b) {
      var x1 = p[0], y1 = p[1], x2 = q[0], y2 = q[1], x3 = a[0], y3 = a[1], x4 = b[0], y4 = b[1];
      var d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4), t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    }
    var out = subject.slice();
    for (var j = 0; j < clip.length && out.length; j++) {
      var a = clip[j], b = clip[(j + 1) % clip.length], input = out; out = [];
      for (var k = 0; k < input.length; k++) {
        var p = input[k], q = input[(k + 1) % input.length], pin = inside(p, a, b), qin = inside(q, a, b);
        if (pin) { out.push(p); if (!qin) out.push(cross(p, q, a, b)); }
        else if (qin) out.push(cross(p, q, a, b));
      }
    }
    return out;
  }
  var AREA_RING = clipToCircle(window.DENSCO_PA_CLIP); // [lng, lat] points
  function areaBox() { var b = [90, -90, 180, -180]; AREA_RING.forEach(function (p) { b[0] = Math.min(b[0], p[1]); b[1] = Math.max(b[1], p[1]); b[2] = Math.min(b[2], p[0]); b[3] = Math.max(b[3], p[0]); }); return b; }
  // Red map pin for the shop location
  var RED_PIN_URL = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 44"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 43 16 43s15-16 15-27.2C31 7.6 24.3 1 16 1z" fill="#e53935" stroke="#a31c19" stroke-width="2"/><circle cx="16" cy="16" r="5.5" fill="#fff"/></svg>');
  var BLUE = '#49b9ed', BLUE_DK = '#49b9ed', DARK = '#49b9ed';
  var el = document.getElementById('service-map');
  var label = document.getElementById('map-label');
  var buttons = document.querySelectorAll('[data-area]');
  if (!el) return;

  // Normalize GeoJSON nesting (single-ring polygons can arrive one level too shallow)
  function depth(a) { var d = 0; while (Array.isArray(a)) { d++; a = a[0]; } return d; }
  Object.keys(AREAS).forEach(function (k) {
    var g = AREAS[k].geom; if (!g) return;
    function validRing(r) { return Array.isArray(r) && r.length > 3 && r.every(function (pt) { return Array.isArray(pt) && typeof pt[0] === 'number' && typeof pt[1] === 'number'; }); }
    function fixPoly(p) { if (depth(p) === 2) p = [p]; return p.filter(validRing); }
    var parts = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    parts = parts.map(fixPoly).filter(function (p) { return p.length; });
    AREAS[k].geom = parts.length ? { type: 'MultiPolygon', coordinates: parts } : null;
  });

  function bboxOf(keys) { // Nominatim bbox: [minLat, maxLat, minLng, maxLng]
    var b = [90, -90, 180, -180];
    keys.forEach(function (k) {
      var a = AREAS[k]; if (!a) return;
      b[0] = Math.min(b[0], a.bbox[0]); b[1] = Math.max(b[1], a.bbox[1]);
      b[2] = Math.min(b[2], a.bbox[2]); b[3] = Math.max(b[3], a.bbox[3]);
    });
    return b;
  }
  function polygonsOf(geom) { // -> array of polygons, each an array of rings of [lng, lat]
    if (!geom) return [];
    return geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  }
  function markActive(key) {
    buttons.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-area') === key); });
    if (label) label.textContent = key === "all" ? ALL_LABEL : (AREAS[key] ? AREAS[key].name : "");
  }

  var api = null; // { select(key) }
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var key = b.getAttribute('data-area');
      if (b.classList.contains('on')) key = 'all'; // click the selected town again to zoom back out
      markActive(key);
      if (api) api.select(key);
      if (window.innerWidth < 960) document.querySelector('.map-box').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
  markActive('all');

  // Shop address link: zoom to the shop and open its info bubble
  var SHOP_HTML = '<div class="shop-pop"><b>Densco Drain Cleaning &amp; Plumbing</b><br>223 W Bridge St (Rear Warehouse)<br>Morrisville, PA 19067<br><a href="https://www.google.com/maps/dir/?api=1&amp;destination=223+W+Bridge+St,+Morrisville,+PA+19067" target="_blank" rel="noopener">Get directions »</a> · <a href="tel:+12672296439">Call</a></div>';
  document.querySelectorAll('[data-shop]').forEach(function (s) {
    s.addEventListener('click', function () {
      markActive('');
      if (api) api.showShop();
      if (window.innerWidth < 960) document.querySelector('.map-box').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  // ---------- Google Maps ----------
  window.densco_initGoogle = function () {
    var g = google.maps;
    var map = new g.Map(el, {
      center: OFFICE, zoom: 12,
      mapTypeControl: true,
      mapTypeControlOptions: { style: g.MapTypeControlStyle.HORIZONTAL_BAR, position: g.ControlPosition.TOP_LEFT, mapTypeIds: ['roadmap', 'satellite'] },
      fullscreenControl: true,
      streetViewControl: true,
      cameraControl: true,
      zoomControl: false,
      gestureHandling: 'cooperative'
    });
    var marker = new g.Marker({ position: OFFICE, map: map, title: "Densco Drain Cleaning & Plumbing - 223 W Bridge St, Morrisville", icon: { url: RED_PIN_URL, scaledSize: new g.Size(32, 44), anchor: new g.Point(16, 44) } });
    var info = new g.InfoWindow({ content: SHOP_HTML });
    marker.addListener('click', function () { info.open({ anchor: marker, map: map }); });
    var circle = new g.Polygon({ paths: AREA_RING.map(function (p) { return { lat: p[1], lng: p[0] }; }), map: map, clickable: false });

    var layers = {};
    Object.keys(AREAS).forEach(function (k) {
      layers[k] = polygonsOf(AREAS[k].geom).map(function (poly) {
        return new g.Polygon({
          paths: poly.map(function (ring) { return ring.map(function (p) { return { lat: p[1], lng: p[0] }; }); }),
          map: null, clickable: false
        });
      });
    });
    function style(k, opts) { (layers[k] || []).forEach(function (p) { p.setOptions(opts); p.setMap(opts.visible === false ? null : map); }); }
    function fitBox(b) { map.fitBounds({ south: b[0], north: b[1], west: b[2], east: b[3] }, 40); }
    function fit(keys) { fitBox(bboxOf(keys)); }

    api = {
      showShop: function () {
        Object.keys(layers).forEach(function (k) { style(k, { visible: false }); });
        circle.setOptions({ fillColor: BLUE, fillOpacity: 0.12, strokeColor: BLUE_DK, strokeOpacity: 0.6, strokeWeight: 1 });
        map.panTo(OFFICE); map.setZoom(16);
        info.open({ anchor: marker, map: map });
      },
      select: function (key) {
        info.close();
        Object.keys(layers).forEach(function (k) { style(k, { visible: false }); });
        var isAll = key === 'all';
        circle.setOptions({ fillColor: BLUE, fillOpacity: isAll ? 0.22 : 0.07, strokeColor: BLUE_DK, strokeOpacity: isAll ? 0.95 : 0.5, strokeWeight: isAll ? 2 : 1 });
        if (isAll) { fitBox(areaBox()); return; }
        style(key, { visible: true, fillColor: BLUE, fillOpacity: 0.25, strokeColor: DARK, strokeOpacity: 1, strokeWeight: 4 });
        fit([key]);
      }
    };
    api.select('all');
  };

  // ---------- Free fallback (Leaflet) ----------
  function initLeaflet() {
    var L = window.L;
    var map = L.map(el, { zoomControl: false, scrollWheelZoom: false }).setView([OFFICE.lat, OFFICE.lng], 12);
    var road = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    var sat = L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery &copy; Esri' }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 })
    ]);
    map.on('click', function () { map.scrollWheelZoom.enable(); });
    map.on('mouseout', function () { map.scrollWheelZoom.disable(); });

    function ctrl(pos, build) {
      var C = L.Control.extend({ onAdd: function () { var d = build(); L.DomEvent.disableClickPropagation(d); return d; } });
      return new C({ position: pos }).addTo(map);
    }

    // Map / Satellite toggle (top-left)
    ctrl('topleft', function () {
      var d = L.DomUtil.create('div', 'lf-types');
      d.innerHTML = '<button type="button" class="on">Map</button><button type="button">Satellite</button>';
      var bs = d.querySelectorAll('button');
      bs[0].onclick = function () { map.removeLayer(sat); road.addTo(map); bs[0].classList.add('on'); bs[1].classList.remove('on'); };
      bs[1].onclick = function () { map.removeLayer(road); sat.addTo(map); bs[1].classList.add('on'); bs[0].classList.remove('on'); };
      return d;
    });
    // Fullscreen toggle (top-right)
    ctrl('topright', function () {
      var b = L.DomUtil.create('button', 'lf-btn'); b.type = 'button'; b.title = 'Toggle fullscreen view'; b.setAttribute('aria-label', 'Toggle fullscreen view');
      b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/></svg>';
      var box = document.querySelector('.map-box');
      b.onclick = function () {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (box.requestFullscreen) box.requestFullscreen();
        else { box.classList.toggle('fs-fallback'); setTimeout(function () { map.invalidateSize(); }, 150); }
      };
      document.addEventListener('fullscreenchange', function () { setTimeout(function () { map.invalidateSize(); }, 150); });
      return b;
    });
    // Street View button: opens Google Street View at the map center (bottom-right, above zoom)
    ctrl('bottomright', function () {
      var b = L.DomUtil.create('button', 'lf-btn'); b.type = 'button'; b.title = 'Open Street View here'; b.setAttribute('aria-label', 'Open Street View at the map center');
      b.innerHTML = '<svg viewBox="0 0 24 24" style="fill:#49b9ed"><circle cx="12" cy="4.5" r="2.5"/><path d="M9 8h6a1 1 0 0 1 1 1v6h-2v7h-4v-7H8V9a1 1 0 0 1 1-1z"/></svg>';
      b.onclick = function () {
        var c = map.getCenter();
        window.open('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + c.lat.toFixed(5) + ',' + c.lng.toFixed(5), '_blank', 'noopener');
      };
      return b;
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    var marker = L.marker([OFFICE.lat, OFFICE.lng], { title: "Densco - 223 W Bridge St, Morrisville", icon: L.icon({ iconUrl: RED_PIN_URL, iconSize: [32, 44], iconAnchor: [16, 44], popupAnchor: [0, -40] }) }).addTo(map).bindPopup(SHOP_HTML, { autoPan: false });
    var circle = L.polygon(AREA_RING.map(function (p) { return [p[1], p[0]]; }), { interactive: false }).addTo(map);

    var layers = {};
    Object.keys(AREAS).forEach(function (k) { if (AREAS[k].geom) layers[k] = L.geoJSON(AREAS[k].geom, { interactive: false }); });
    function fitBox(b) { map.flyToBounds([[b[0], b[2]], [b[1], b[3]]], { padding: [40, 40], duration: 0.8 }); }
    function fit(keys) { fitBox(bboxOf(keys)); }

    api = {
      showShop: function () {
        Object.keys(layers).forEach(function (k) { map.removeLayer(layers[k]); });
        circle.setStyle({ color: BLUE_DK, weight: 1, opacity: 0.6, fillColor: BLUE, fillOpacity: 0.12 });
        map.flyTo([OFFICE.lat, OFFICE.lng], 16, { duration: 0.8 });
        marker.openPopup();
      },
      select: function (key) {
        map.closePopup();
        Object.keys(layers).forEach(function (k) { map.removeLayer(layers[k]); });
        var isAll = key === 'all';
        circle.setStyle({ color: BLUE_DK, weight: isAll ? 2 : 1, opacity: isAll ? 0.95 : 0.5, fillColor: BLUE, fillOpacity: isAll ? 0.22 : 0.07 });
        if (isAll) { fitBox(areaBox()); return; }
        if (layers[key]) layers[key].setStyle({ color: DARK, weight: 4, opacity: 1, fillColor: BLUE, fillOpacity: 0.25 }).addTo(map);
        fit([key]);
      }
    };
    api.select('all');
  }

  function load(src, cb) { var s = document.createElement('script'); s.src = src; s.async = true; if (cb) s.onload = cb; document.head.appendChild(s); }

  if (GOOGLE_MAPS_API_KEY) {
    load('https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(GOOGLE_MAPS_API_KEY) + '&v=weekly&callback=densco_initGoogle');
  } else {
    var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
    load('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', initLeaflet);
  }
})();

