import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { THUMB_PIXEL_RATIO } from './thumbs.js';

let map;
const photosById = new Map();
const imageIds = new Set();
let firstBatch = true;

export function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        satellite: {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256,
          maxzoom: 19,
          attribution:
            'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community'
        }
      },
      layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }]
    },
    center: [0, 20],
    zoom: 1.5,
    preserveDrawingBuffer: true
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
  window.__map = map;
  window.__photos = photosById;

  map.on('error', (e) => console.error('[map error]', e?.error?.message || e));

  const ro = new ResizeObserver(() => map.resize());
  ro.observe(map.getContainer());

  map.on('load', () => {
    map.resize();
    map.addSource('photos', {
      type: 'geojson',
      data: emptyFC(),
      cluster: true,
      clusterMaxZoom: 16,
      clusterRadius: 45
    });

    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'photos',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#4a90e2',
        'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26, 200, 32],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    });

    map.addLayer({
      id: 'photo-dots',
      type: 'circle',
      source: 'photos',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': '#ff5a5f',
        'circle-radius': 5,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff'
      }
    });

    map.addLayer({
      id: 'photo-thumbs',
      type: 'symbol',
      source: 'photos',
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['get', 'id'],
        'icon-size': 1,
        'icon-allow-overlap': true,
        'icon-anchor': 'center'
      }
    });

    map.on('click', 'clusters', (e) => {
      const feat = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
      if (!feat) return;
      const clusterId = feat.properties.cluster_id;
      map.getSource('photos').getClusterExpansionZoom(clusterId).then((zoom) => {
        map.easeTo({ center: feat.geometry.coordinates, zoom });
      });
    });

    const onPointClick = (e) => {
      const feat = e.features[0];
      const photo = photosById.get(feat.properties.id);
      if (photo) {
        window.dispatchEvent(new CustomEvent('photo-click', { detail: photo }));
      }
    };
    map.on('click', 'photo-thumbs', onPointClick);
    map.on('click', 'photo-dots', onPointClick);

    const setCursor = (v) => () => (map.getCanvas().style.cursor = v);
    map.on('mouseenter', 'clusters', setCursor('pointer'));
    map.on('mouseleave', 'clusters', setCursor(''));
    map.on('mouseenter', 'photo-thumbs', setCursor('pointer'));
    map.on('mouseleave', 'photo-thumbs', setCursor(''));
    map.on('mouseenter', 'photo-dots', setCursor('pointer'));
    map.on('mouseleave', 'photo-dots', setCursor(''));
  });
}

function emptyFC() {
  return { type: 'FeatureCollection', features: [] };
}

function refreshSource() {
  const src = map.getSource('photos');
  if (!src) return;
  const features = [];
  for (const p of photosById.values()) {
    features.push({
      type: 'Feature',
      properties: { id: p.id, name: p.name },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] }
    });
  }
  src.setData({ type: 'FeatureCollection', features });
}

export function addPhotos(photos) {
  for (const p of photos) photosById.set(p.id, p);
  const apply = () => {
    refreshSource();
    if (firstBatch && photosById.size > 0) {
      firstBatch = false;
      fitToPhotos();
    }
  };
  if (map.getSource('photos')) apply();
  else map.once('load', apply);
}

export function setThumbsVisible(visible) {
  const apply = () => {
    map.setLayoutProperty('photo-thumbs', 'visibility', visible ? 'visible' : 'none');
    map.setPaintProperty('photo-dots', 'circle-radius', visible ? 5 : 8);
    map.setPaintProperty('photo-dots', 'circle-stroke-width', visible ? 1.5 : 2);
  };
  if (map.getLayer('photo-thumbs')) apply();
  else map.once('load', apply);
}

export function setPhotoImage(id, bitmap) {
  const add = () => {
    if (!photosById.has(id)) return;
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, bitmap, { pixelRatio: THUMB_PIXEL_RATIO });
    imageIds.add(id);
  };
  if (map.isStyleLoaded()) add();
  else map.once('load', add);
}

function fitToPhotos() {
  const bounds = new maplibregl.LngLatBounds();
  for (const p of photosById.values()) bounds.extend([p.lng, p.lat]);
  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 800 });
  }
}

export function clearPhotos() {
  for (const id of imageIds) {
    if (map.hasImage?.(id)) map.removeImage(id);
  }
  imageIds.clear();
  photosById.clear();
  firstBatch = true;
  if (map.getSource('photos')) refreshSource();
}
