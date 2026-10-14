/**
 * Clean Kadal — Experiment Data Exporter
 * Generates genuine CSV and JSON export files from recorded experiment observations.
 */

export function exportExperimentToCSV(experimentSession) {
  if (!experimentSession || !experimentSession.records || experimentSession.records.length === 0) {
    alert('No experiment observations recorded to export.');
    return;
  }

  const headers = [
    'experiment_id',
    'timestamp_sec',
    'datetime_iso',
    'model_name',
    'model_type',
    'track_id',
    'class_name',
    'confidence',
    'is_litter_candidate',
    'pos_x',
    'pos_y',
    'vel_x',
    'vel_y',
    'speed',
    'direction_deg',
    'track_duration_sec',
    'predicted_x',
    'predicted_y',
    'prediction_horizon_sec',
    'prediction_reliability',
    'cam_dx',
    'cam_dy',
    'cam_status',
    'wave_direction_deg',
    'wave_reliability',
    'wind_direction'
  ];

  const rows = [];
  rows.push(headers.join(','));

  const expId = experimentSession.id;
  const modelName = experimentSession.model_name || 'unknown';
  const modelType = experimentSession.model_type || 'unknown';

  experimentSession.records.forEach((rec) => {
    const t = rec.timestamp;
    const iso = new Date(t * 1000).toISOString();
    const cam = rec.camera_motion || {};
    const wave = rec.wave_analysis || {};

    if (rec.tracked_objects && rec.tracked_objects.length > 0) {
      rec.tracked_objects.forEach((obj) => {
        const row = [
          expId,
          t.toFixed(3),
          iso,
          `"${modelName}"`,
          modelType,
          obj.track_id,
          obj.class_name,
          obj.confidence,
          obj.is_litter_candidate ? 1 : 0,
          obj.position ? obj.position[0] : '',
          obj.position ? obj.position[1] : '',
          obj.velocity ? obj.velocity[0] : '',
          obj.velocity ? obj.velocity[1] : '',
          obj.speed !== undefined ? obj.speed : '',
          obj.direction_deg !== null ? obj.direction_deg : '',
          obj.track_duration_sec !== undefined ? obj.track_duration_sec : '',
          obj.predicted_position ? obj.predicted_position[0] : '',
          obj.predicted_position ? obj.predicted_position[1] : '',
          obj.prediction_horizon_sec || '',
          obj.prediction_reliability || '',
          cam.dx !== undefined ? cam.dx : '',
          cam.dy !== undefined ? cam.dy : '',
          cam.status || 'unavailable',
          wave.dominant_direction_deg !== null ? wave.dominant_direction_deg : '',
          wave.reliability || 'insufficient_data',
          `"${wave.wind_direction || 'Not measured'}"`
        ];
        rows.push(row.join(','));
      });
    } else {
      // Row recording environmental measurement even if no objects present
      const row = [
        expId,
        t.toFixed(3),
        iso,
        `"${modelName}"`,
        modelType,
        'None',
        'None',
        '',
        0,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        cam.dx !== undefined ? cam.dx : '',
        cam.dy !== undefined ? cam.dy : '',
        cam.status || 'unavailable',
        wave.dominant_direction_deg !== null ? wave.dominant_direction_deg : '',
        wave.reliability || 'insufficient_data',
        `"${wave.wind_direction || 'Not measured'}"`
      ];
      rows.push(row.join(','));
    }
  });

  const csvContent = rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `clean_kadal_exp_${expId}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportExperimentToJSON(experimentSession) {
  if (!experimentSession || !experimentSession.records || experimentSession.records.length === 0) {
    alert('No experiment observations recorded to export.');
    return;
  }

  const jsonString = JSON.stringify(experimentSession, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `clean_kadal_exp_${experimentSession.id}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
