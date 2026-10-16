let modelPromise;
let tracker = { nextId: 1, tracks: new Map() };

const TRACK_MAX_GAP_SEC = 10;
const MAX_DWELL_STEP_SEC = 2.5;
const TRACK_MAX_DISTANCE = 0.22;
const MAX_HISTORY = 30;

async function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const [tf, cocoSsd] = await Promise.all([
        import('@tensorflow/tfjs-core'),
        import('@tensorflow-models/coco-ssd'),
        import('@tensorflow/tfjs-backend-webgl'),
        import('@tensorflow/tfjs-backend-cpu'),
      ]);
      let backendReady = false;
      try {
        backendReady = await tf.setBackend('webgl');
      } catch {
        backendReady = false;
      }
      if (!backendReady) backendReady = await tf.setBackend('cpu');
      if (!backendReady) throw new Error('TensorFlow.js could not initialize WebGL or CPU inference.');
      await tf.ready();
      const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      return { model, tf };
    })().catch((error) => {
      modelPromise = undefined;
      throw error;
    });
  }
  return modelPromise;
}

function imageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The camera frame could not be decoded in the browser.'));
    image.src = dataUrl;
  });
}

function centerOf(box) {
  return [(box.x_min + box.x_max) / 2, (box.y_min + box.y_max) / 2];
}

function compassLabel(vx, vy) {
  const angle = (Math.atan2(vy, vx) * 180 / Math.PI + 360) % 360;
  const sectors = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  return sectors[Math.round(angle / 45) % 8];
}

function updateTracks(detections, timestamp, horizonSec) {
  const candidates = [];
  for (const [id, track] of tracker.tracks.entries()) {
    if (timestamp - track.lastSeen <= TRACK_MAX_GAP_SEC) candidates.push({ id, track });
  }
  const used = new Set();
  const results = [];

  for (const detection of detections) {
    const position = centerOf(detection.box);
    let chosen = null;
    let bestDistance = TRACK_MAX_DISTANCE;
    for (const candidate of candidates) {
      if (used.has(candidate.id) || candidate.track.class_name !== detection.class_name) continue;
      const dx = candidate.track.position[0] - position[0];
      const dy = candidate.track.position[1] - position[1];
      const distance = Math.hypot(dx, dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        chosen = candidate;
      }
    }

    let track;
    if (chosen) {
      used.add(chosen.id);
      track = chosen.track;
    } else {
      const id = tracker.nextId++;
      track = {
        track_id: id,
        class_name: detection.class_name,
        firstSeen: timestamp,
        lastSeen: timestamp,
        origin_position: position,
        position,
        history: [],
        zoneDwell: new Map(),
      };
      tracker.tracks.set(id, track);
      used.add(id);
    }

    const previous = track.history[track.history.length - 1];
    const dt = previous ? Math.max(0.05, timestamp - previous.t) : 0;
    const gridX = Math.min(3, Math.floor(position[0] * 4));
    const gridY = Math.min(3, Math.floor(position[1] * 4));
    const cellKey = `${gridY},${gridX}`;
    if (track.lastCell === cellKey && previous && dt <= MAX_DWELL_STEP_SEC) {
      track.zoneDwell.set(cellKey, (track.zoneDwell.get(cellKey) || 0) + dt);
    }
    track.lastCell = cellKey;
    const velocity = previous
      ? [(position[0] - previous.x) / dt, (position[1] - previous.y) / dt]
      : [0, 0];
    const speed = Math.hypot(velocity[0], velocity[1]);
    track.position = position;
    track.lastSeen = timestamp;
    track.history.push({ t: timestamp, x: position[0], y: position[1] });
    if (track.history.length > MAX_HISTORY) track.history.shift();

    const predicted = [
      Math.max(0, Math.min(1, position[0] + velocity[0] * horizonSec)),
      Math.max(0, Math.min(1, position[1] + velocity[1] * horizonSec)),
    ];
    const motion = speed >= 0.005 ? compassLabel(velocity[0], velocity[1]) : null;
    const totalDx = position[0] - track.origin_position[0];
    const totalDy = position[1] - track.origin_position[1];
    results.push({
      track_id: track.track_id,
      class_name: detection.class_name,
      confidence: detection.confidence,
      box: detection.box,
      position,
      velocity,
      speed,
      direction_deg: speed >= 0.005 ? (Math.atan2(velocity[1], velocity[0]) * 180 / Math.PI + 360) % 360 : null,
      track_duration_sec: timestamp - track.firstSeen,
      history: [...track.history],
      is_litter_candidate: true,
      predicted_position: track.history.length >= 2 ? predicted : null,
      prediction_horizon_sec: track.history.length >= 2 ? horizonSec : null,
      prediction_reliability: track.history.length >= 3 ? 'reliable' : track.history.length >= 2 ? 'tentative' : 'insufficient_history',
      missed_frames: 0,
      travelled_from: Math.hypot(totalDx, totalDy) >= 0.02
        ? `From ${compassLabel(-totalDx, -totalDy)} · Origin zone: ${zoneName(...track.origin_position)}`
        : `Originated at ${zoneName(...track.origin_position)}`,
      navigating_towards: motion ? `Image direction ${motion} · short-term estimate` : 'No clear image-space motion yet',
      origin_position: track.origin_position,
      heading_compass: motion || 'STATIONARY',
    });
  }

  for (const [id, track] of tracker.tracks.entries()) {
    if (timestamp - track.lastSeen > TRACK_MAX_GAP_SEC) tracker.tracks.delete(id);
  }
  return results;
}

function getAccumulationSummary() {
  const cellDwell = new Map();
  for (const track of tracker.tracks.values()) {
    for (const [cell, dwell] of track.zoneDwell.entries()) {
      cellDwell.set(cell, (cellDwell.get(cell) || 0) + dwell);
    }
  }
  const ranked = [...cellDwell.entries()].sort((a, b) => b[1] - a[1]);
  const hotspots = ranked.filter(([, dwell]) => dwell >= 5);
  if (hotspots.length === 0) {
    return {
      summary_status: 'insufficient_data',
      dominant_zone: null,
      hotspots_count: 0,
      dwell_threshold_sec: 5,
      coordinate_space: 'normalized_image_grid',
    };
  }
  const [row, column] = hotspots[0][0].split(',').map(Number);
  return {
    summary_status: 'observed',
    dominant_zone: `Image grid row ${row + 1}, column ${column + 1}`,
    hotspots_count: hotspots.length,
    dominant_dwell_sec: Number(hotspots[0][1].toFixed(1)),
    dwell_threshold_sec: 5,
    coordinate_space: 'normalized_image_grid',
    disclaimer: 'Image-space dwell estimate only; no shoreline, map coordinate, or geographic location is inferred.',
  };
}

function zoneName(x, y) {
  const vertical = y < 0.33 ? 'Top' : y > 0.66 ? 'Bottom' : 'Center';
  const horizontal = x < 0.33 ? 'Left' : x > 0.66 ? 'Right' : 'Center';
  return `${vertical}-${horizontal} Image Zone`;
}

export function resetBrowserTracker() {
  tracker = { nextId: 1, tracks: new Map() };
}

export async function detectInBrowser(dataUrl, {
  confidenceThreshold = 0.25,
  isStaticImage = false,
  timestamp = Date.now() / 1000,
  predictionHorizonSec = 1.5,
} = {}) {
  const [{ model, tf }, image] = await Promise.all([loadModel(), imageFromDataUrl(dataUrl)]);
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const predictions = await model.detect(image, 15, confidenceThreshold);
  const detections = predictions
    .filter((prediction) => ['bottle', 'cup'].includes(String(prediction.class).toLowerCase()))
    .map((prediction) => {
      const [x, y, width, height] = prediction.bbox;
      return {
        class_name: String(prediction.class).toLowerCase(),
        confidence: Number(prediction.score.toFixed(3)),
        box: {
          x_min: Math.max(0, Math.min(1, x / imageWidth)),
          y_min: Math.max(0, Math.min(1, y / imageHeight)),
          x_max: Math.max(0, Math.min(1, (x + width) / imageWidth)),
          y_max: Math.max(0, Math.min(1, (y + height) / imageHeight)),
        },
        is_litter_candidate: true,
        is_custom_class: false,
      };
    });
  const trackedObjects = isStaticImage ? [] : updateTracks(detections, timestamp, predictionHorizonSec);
  const modelStatus = {
    model_loaded: true,
    model_name: 'COCO-SSD Lite · Browser Local',
    model_type: 'pretrained_baseline',
    is_custom_trained: false,
    supported_classes: ['bottle', 'cup'],
    weights_path: 'TensorFlow.js COCO-SSD lite_mobilenet_v2',
    device: tf.getBackend(),
    status_message: 'Runs locally in this browser. Generic COCO classes only; not the custom Clean Kadal checkpoint.',
    confidence_threshold: confidenceThreshold,
    inference_size: 640,
  };
  return {
    timestamp,
    model_status: modelStatus,
    detections,
    tracked_objects: trackedObjects,
    camera_motion: { dx: 0, dy: 0, rotation_deg: 0, status: 'unavailable', warning: 'Browser-local object tracking does not estimate camera motion.' },
    wave_analysis: {
      vector: [0, 0], magnitude: 0, usable_measurements: 0,
      reliability: 'insufficient_data', camera_compensation_status: 'unavailable',
      disclaimer: 'Browser-local mode tracks detected object motion; it does not estimate water flow from wave imagery.',
      wind_direction: 'Not measured',
    },
    accumulation_summary: isStaticImage ? null : getAccumulationSummary(),
    warnings: isStaticImage ? ['Still image: object detection only; motion and accumulation require live frames.'] : [],
  };
}
