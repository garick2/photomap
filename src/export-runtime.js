// Runs inside the exported standalone HTML.
// Expects: window.__PHOTOS__ = [{ id, name, date, lat, lng, thumb, preview }, ...]
// Expects: maplibregl loaded on the page (from CDN).
(function () {
  const photos = window.__PHOTOS__ || [];
  const photosById = Object.fromEntries(photos.map((p) => [p.id, p]));

  const map = new maplibregl.Map({
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
  const ro = new ResizeObserver(() => map.resize());
  ro.observe(map.getContainer());

  async function bitmapFromDataUrl(dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    return await createImageBitmap(blob);
  }

  map.on('load', () => {
    map.resize();

    const features = photos.map((p) => ({
      type: 'Feature',
      properties: { id: p.id, name: p.name },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] }
    }));

    map.addSource('photos', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features },
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

    // Load thumbnails as map images (progressive)
    (async () => {
      for (const p of photos) {
        try {
          const bmp = await bitmapFromDataUrl(p.thumb);
          if (!map.hasImage(p.id)) map.addImage(p.id, bmp, { pixelRatio: 2 });
        } catch (_) {}
      }
    })();

    // Fit to photos
    if (features.length > 0) {
      const b = new maplibregl.LngLatBounds();
      features.forEach((f) => b.extend(f.geometry.coordinates));
      map.fitBounds(b, { padding: 60, maxZoom: 12, duration: 0 });
    }

    map.on('click', 'clusters', (e) => {
      const feat = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
      if (!feat) return;
      map.getSource('photos')
        .getClusterExpansionZoom(feat.properties.cluster_id)
        .then((zoom) => map.easeTo({ center: feat.geometry.coordinates, zoom }));
    });

    const onPointClick = (e) => {
      const p = photosById[e.features[0].properties.id];
      if (p) openViewer(p);
    };
    map.on('click', 'photo-thumbs', onPointClick);
    map.on('click', 'photo-dots', onPointClick);

    const setCursor = (v) => () => (map.getCanvas().style.cursor = v);
    for (const layer of ['clusters', 'photo-thumbs', 'photo-dots']) {
      map.on('mouseenter', layer, setCursor('pointer'));
      map.on('mouseleave', layer, setCursor(''));
    }
  });

  // Viewer
  const viewer = document.getElementById('viewer');
  const img = document.getElementById('viewer-img');
  const caption = document.getElementById('viewer-caption');
  function openViewer(p) {
    caption.textContent = p.name + (p.date ? ' — ' + new Date(p.date).toLocaleString() : '');
    img.src = p.preview;
    viewer.hidden = false;
  }
  function closeViewer() {
    viewer.hidden = true;
    img.removeAttribute('src');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  document.getElementById('viewer-close').addEventListener('click', closeViewer);
  document.getElementById('viewer-fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else viewer.requestFullscreen().catch(() => {});
  });
  viewer.addEventListener('click', (e) => { if (e.target === viewer) closeViewer(); });
  document.addEventListener('keydown', (e) => {
    if (viewer.hidden) return;
    if (e.key === 'Escape') closeViewer();
    else if (e.key === 'f') {
      if (document.fullscreenElement) document.exitFullscreen();
      else viewer.requestFullscreen().catch(() => {});
    }
  });

  // Thumbnail toggle
  const cb = document.getElementById('thumbs-checkbox');
  cb.addEventListener('change', () => {
    map.setLayoutProperty('photo-thumbs', 'visibility', cb.checked ? 'visible' : 'none');
    map.setPaintProperty('photo-dots', 'circle-radius', cb.checked ? 5 : 8);
    map.setPaintProperty('photo-dots', 'circle-stroke-width', cb.checked ? 1.5 : 2);
  });
})();
