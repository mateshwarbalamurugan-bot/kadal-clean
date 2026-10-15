import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const BAUD_RATE = 115200;
const MAX_PWM = 90;
const MIN_AUTONOMY_CONFIDENCE = 0.6;
const COMMAND_TIMEOUT_MS = 650;

export default function ArduinoControlPanel({
  analysisData,
  cameraActive,
  modelStatus,
  confidenceThreshold = 0.25,
  errorMessage,
}) {
  const [supported, setSupported] = useState(false);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [emergencyLatched, setEmergencyLatched] = useState(false);
  const [throttle, setThrottle] = useState(40);
  const [manualActive, setManualActive] = useState(false);
  const [steeringTolerance, setSteeringTolerance] = useState(0.10);
  const [targetSelectionMode, setTargetSelectionMode] = useState('stable_track');
  const [lastCommand, setLastCommand] = useState('STOP');
  const [lastReply, setLastReply] = useState('No Arduino connected');
  const [message, setMessage] = useState('Motors remain stopped until you press a control.');
  const [serialError, setSerialError] = useState('');

  const portRef = useRef(null);
  const readerRef = useRef(null);
  const commandSequenceRef = useRef(0);
  const writeQueueRef = useRef(Promise.resolve());
  const manualIntervalRef = useRef(null);
  const targetLockRef = useRef(null);
  const steeringStateRef = useRef({ direction: 'center', left: 0, right: 0 });

  useEffect(() => {
    setSupported(typeof navigator !== 'undefined' && 'serial' in navigator);
  }, []);

  const writeLine = useCallback((line) => {
    const port = portRef.current;
    if (!port?.writable) return Promise.resolve(false);
    writeQueueRef.current = writeQueueRef.current.then(async () => {
      if (portRef.current !== port || !port.writable) return false;
      const writer = port.writable.getWriter();
      try {
        await writer.write(new TextEncoder().encode(`${line}\n`));
        setLastCommand(line);
        return true;
      } finally {
        writer.releaseLock();
      }
    }).catch((err) => {
      setSerialError(`Serial write failed: ${err.message}`);
      return false;
    });
    return writeQueueRef.current;
  }, []);

  const sendMotor = useCallback((left, right) => {
    const clamp = (value) => Math.max(-MAX_PWM, Math.min(MAX_PWM, Math.round(value)));
    commandSequenceRef.current += 1;
    return writeLine(`M,${commandSequenceRef.current},${clamp(left)},${clamp(right)}`);
  }, [writeLine]);

  const stopManual = useCallback(() => {
    if (manualIntervalRef.current) {
      clearInterval(manualIntervalRef.current);
      manualIntervalRef.current = null;
    }
    setManualActive(false);
    if (connected && ready && !emergencyLatched && !autoEnabled) {
      sendMotor(0, 0);
      setMessage('Manual command released; motors stopped.');
    }
  }, [autoEnabled, connected, emergencyLatched, ready, sendMotor]);

  const beginManual = useCallback((leftRatio, rightRatio) => {
    if (!connected || !ready || autoEnabled || emergencyLatched) return;
    if (manualIntervalRef.current) clearInterval(manualIntervalRef.current);
    const issue = () => sendMotor(throttle * leftRatio, throttle * rightRatio);
    issue();
    manualIntervalRef.current = setInterval(issue, 150);
    setManualActive(true);
    setMessage('Manual control active. Release the button to stop.');
  }, [autoEnabled, connected, emergencyLatched, ready, sendMotor, throttle]);

  const readResponses = useCallback(async (port) => {
    if (!port.readable) return;
    const reader = port.readable.getReader();
    readerRef.current = reader;
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (portRef.current === port) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        lines.filter(Boolean).forEach((line) => {
          setLastReply(line.slice(0, 180));
          const fields = line.split(',');
          if (fields[0] === 'STATUS' && fields.length >= 3) {
            const lastSequence = Number(fields[1]);
            if (Number.isSafeInteger(lastSequence) && lastSequence >= 0) {
              commandSequenceRef.current = Math.max(commandSequenceRef.current, lastSequence);
            }
            setEmergencyLatched(fields[2] === '1');
            setReady(true);
            setMessage(fields[2] === '1' ? 'Arduino reports an emergency-stop latch. Reset it deliberately; motors remain stopped.' : 'Arduino status verified. Motors are stopped and controls are ready.');
          } else if (line === 'OK,RESET') {
            setEmergencyLatched(false);
            setMessage('Arduino confirmed the emergency latch reset. Motors remain stopped.');
          } else if (line.startsWith('ERR,')) {
            setSerialError(`Arduino rejected a command: ${line.slice(4)}`);
          }
        });
      }
    } catch (err) {
      if (portRef.current === port) setSerialError(`Serial read failed: ${err.message}`);
    } finally {
      try { reader.releaseLock(); } catch { /* stream may already be closed */ }
      if (readerRef.current === reader) readerRef.current = null;
    }
  }, []);

  const connectArduino = async () => {
    setSerialError('');
    if (!('serial' in navigator)) {
      setSerialError('Web Serial is not supported in this browser. Use current Chrome or Edge over HTTPS or localhost.');
      return;
    }
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: BAUD_RATE });
      portRef.current = port;
      setConnected(true);
      setReady(false);
      setAutoEnabled(false);
      setManualActive(false);
      setMessage('Arduino connected. Waiting for firmware status; motor controls stay locked until verified.');
      void readResponses(port);
      await writeLine('Q');
    } catch (err) {
      setSerialError(`Could not connect to Arduino: ${err.message}`);
    }
  };

  const disconnectArduino = async () => {
    setAutoEnabled(false);
    setManualActive(false);
    steeringStateRef.current = { direction: 'center', left: 0, right: 0 };
    if (manualIntervalRef.current) {
      clearInterval(manualIntervalRef.current);
      manualIntervalRef.current = null;
    }
    const port = portRef.current;
    if (!port) return;
    if (ready && !emergencyLatched) await sendMotor(0, 0);
    try { await readerRef.current?.cancel(); } catch { /* already closed */ }
    portRef.current = null;
    try { await port.close(); } catch (err) { setSerialError(`Port close warning: ${err.message}`); }
    setConnected(false);
    setReady(false);
    setLastReply('Disconnected');
    setMessage('Disconnected. The Arduino communication timeout is the fallback motor-stop safeguard.');
  };

  const emergencyStop = () => {
    setAutoEnabled(false);
    setManualActive(false);
    steeringStateRef.current = { direction: 'center', left: 0, right: 0 };
    if (manualIntervalRef.current) {
      clearInterval(manualIntervalRef.current);
      manualIntervalRef.current = null;
    }
    if (connected) void writeLine('E');
    setEmergencyLatched(true);
    setLastCommand('E — EMERGENCY STOP');
    setMessage('Emergency stop latched. Reset requires a deliberate button press.');
  };

  const resetEmergencyStop = () => {
    if (!connected || !ready) return;
    commandSequenceRef.current += 1;
    void writeLine(`R,${commandSequenceRef.current}`);
    setMessage('Reset requested. Wait for Arduino confirmation; motors remain stopped.');
  };

  const currentTarget = useMemo(() => {
    const candidates = (analysisData?.detections || [])
      .filter((detection) => detection.is_litter_candidate && detection.confidence >= Math.max(MIN_AUTONOMY_CONFIDENCE, confidenceThreshold))
      .sort((a, b) => b.confidence - a.confidence);
    if (!candidates.length) return null;
    const tracks = analysisData?.tracked_objects || [];
    const findDetectionForTrack = (track) => candidates.find((detection) => {
      const x = (detection.box.x_min + detection.box.x_max) / 2;
      const y = (detection.box.y_min + detection.box.y_max) / 2;
      return detection.class_name === track.class_name && Math.abs(x - track.position[0]) < 0.03 && Math.abs(y - track.position[1]) < 0.03;
    });
    const lockedTrack = targetSelectionMode === 'stable_track'
      ? tracks.find((track) => track.track_id === targetLockRef.current && track.confidence >= Math.max(MIN_AUTONOMY_CONFIDENCE, confidenceThreshold))
      : null;
    if (lockedTrack) {
      const detection = findDetectionForTrack(lockedTrack);
      if (detection) return { ...detection, track_id: lockedTrack.track_id };
    }
    const bestTrack = [...tracks]
      .filter((track) => track.confidence >= Math.max(MIN_AUTONOMY_CONFIDENCE, confidenceThreshold))
      .sort((a, b) => b.confidence - a.confidence)[0];
    if (bestTrack) {
      const detection = findDetectionForTrack(bestTrack);
      if (detection) return { ...detection, track_id: bestTrack.track_id };
    }
    return candidates[0];
  }, [analysisData, confidenceThreshold, targetSelectionMode]);

  const operationState = useMemo(() => {
    if (emergencyLatched) return 'Emergency stop';
    if (serialError || errorMessage) return 'Communication error';
    if (!connected) return 'Disconnected';
    if (!ready) return 'Initializing / serial handshake';
    if (autoEnabled) {
      if (!cameraActive || !modelStatus?.model_loaded) return 'Safety stop — camera/model unavailable';
      if (!currentTarget) return 'Target lost — motors stopped';
      return 'Supervised target guidance active';
    }
    if (manualActive) return 'Manual movement active';
    if (!cameraActive) return 'Camera unavailable';
    if (!modelStatus) return 'Model initializing';
    if (!modelStatus.model_loaded) return 'Model unavailable';
    if (currentTarget) return 'Target acquired — awaiting operator';
    return 'Waiting for valid detection';
  }, [autoEnabled, cameraActive, connected, currentTarget, emergencyLatched, errorMessage, manualActive, modelStatus, ready, serialError]);

  useEffect(() => {
    targetLockRef.current = currentTarget?.track_id ?? null;
  }, [currentTarget]);

  const enableSupervisedGuidance = () => {
    if (!connected || !ready) {
      setSerialError('Connect the Arduino and complete its status check before enabling guidance.');
      return;
    }
    if (!cameraActive || !modelStatus?.model_loaded || !modelStatus?.is_custom_trained) {
      setSerialError('Guidance requires an active camera and the loaded custom Clean Kadal model.');
      return;
    }
    if (!currentTarget) {
      setSerialError('No litter target meets the minimum confidence threshold. Keep motors stopped until one is detected.');
      return;
    }
    if (emergencyLatched) {
      setSerialError('Reset the emergency-stop latch and wait for Arduino confirmation first.');
      return;
    }
    setSerialError('');
    steeringStateRef.current = { direction: 'center', left: 0, right: 0 };
    setAutoEnabled(true);
    setMessage('Supervised low-speed image-centering active. Keep the test area clear and be ready to stop.');
  };

  useEffect(() => {
    if (!autoEnabled) return undefined;
    if (!connected || !ready || emergencyLatched || !cameraActive || !modelStatus?.model_loaded || !modelStatus?.is_custom_trained || errorMessage) {
      setAutoEnabled(false);
      if (connected && ready && !emergencyLatched) sendMotor(0, 0);
      setMessage('Guidance stopped because a required connection, model, camera, or API state is unhealthy.');
      return undefined;
    }
    if (!currentTarget) {
      sendMotor(0, 0);
      steeringStateRef.current = { direction: 'center', left: 0, right: 0 };
      setAutoEnabled(false);
      setMessage('Target lost or below confidence threshold. Motors stopped; explicitly re-enable guidance after reacquiring a target.');
      return undefined;
    }

    const centerX = (currentTarget.box.x_min + currentTarget.box.x_max) / 2;
    const offset = centerX - 0.5;
    const forward = Math.min(60, throttle);
    const previous = steeringStateRef.current;
    let direction = 'center';
    const hysteresis = steeringTolerance * 0.45;
    if (previous.direction === 'left' && offset < -hysteresis) direction = 'left';
    else if (previous.direction === 'right' && offset > hysteresis) direction = 'right';
    else if (offset < -steeringTolerance) direction = 'left';
    else if (offset > steeringTolerance) direction = 'right';
    const targetLeft = direction === 'left' ? Math.round(forward * 0.55) : forward;
    const targetRight = direction === 'right' ? Math.round(forward * 0.55) : forward;
    const blend = previous.left === 0 && previous.right === 0 ? 1 : 0.35;
    const left = Math.round(previous.left * (1 - blend) + targetLeft * blend);
    const right = Math.round(previous.right * (1 - blend) + targetRight * blend);
    steeringStateRef.current = { direction, left, right };
    sendMotor(left, right);
    setMessage(`Supervised image-centering: target ${direction === 'center' ? 'inside center tolerance' : direction}; track ${currentTarget.track_id ?? 'not locked'}; low-speed command only.`);

    const captureTimestamp = Number(analysisData?.timestamp || 0) * 1000;
    const staleTimer = setInterval(() => {
      if (!captureTimestamp || Date.now() - captureTimestamp > 1500) {
        sendMotor(0, 0);
        setAutoEnabled(false);
        setMessage('Camera/inference data became stale. Guidance disabled and motors stopped.');
      }
    }, 250);
    return () => clearInterval(staleTimer);
  }, [autoEnabled, connected, ready, emergencyLatched, cameraActive, modelStatus, errorMessage, analysisData, currentTarget, sendMotor, throttle, steeringTolerance]);

  useEffect(() => {
    const onDisconnect = (event) => {
      if (event.target === portRef.current) {
        portRef.current = null;
        if (manualIntervalRef.current) {
          clearInterval(manualIntervalRef.current);
          manualIntervalRef.current = null;
        }
        setConnected(false);
        setReady(false);
        setAutoEnabled(false);
        setManualActive(false);
        setMessage('Arduino disconnected. The firmware communication timeout must stop the motors.');
      }
    };
    navigator.serial?.addEventListener?.('disconnect', onDisconnect);
    return () => navigator.serial?.removeEventListener?.('disconnect', onDisconnect);
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden && connected && ready) {
        if (manualIntervalRef.current) {
          clearInterval(manualIntervalRef.current);
          manualIntervalRef.current = null;
        }
        setAutoEnabled(false);
        setManualActive(false);
        if (!emergencyLatched) sendMotor(0, 0);
        setMessage('Page hidden. Guidance disabled and motors stopped.');
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [connected, ready, emergencyLatched, sendMotor]);

  useEffect(() => () => {
    if (manualIntervalRef.current) clearInterval(manualIntervalRef.current);
    const port = portRef.current;
    if (port?.writable) {
      commandSequenceRef.current += 1;
      const writer = port.writable.getWriter();
      void writer.write(new TextEncoder().encode(`M,${commandSequenceRef.current},0,0\n`)).catch(() => {}).finally(() => {
        try { writer.releaseLock(); } catch { /* ignored on unmount */ }
      });
    }
    try { void readerRef.current?.cancel(); } catch { /* board timeout is the fallback */ }
    try { void port?.close(); } catch { /* board timeout is the fallback */ }
  }, []);

  const driveButton = (label, left, right, extraClass = '') => (
    <button
      type="button"
      className={`hardware-drive-button ${extraClass}`}
      disabled={!connected || !ready || autoEnabled || emergencyLatched}
      onPointerDown={(event) => { event.preventDefault(); beginManual(left, right); }}
      onPointerUp={stopManual}
      onPointerCancel={stopManual}
      onPointerLeave={stopManual}
      onContextMenu={(event) => event.preventDefault()}
    >
      {label}
    </button>
  );

  const stopMotors = () => {
    setAutoEnabled(false);
    setManualActive(false);
    steeringStateRef.current = { direction: 'center', left: 0, right: 0 };
    if (manualIntervalRef.current) {
      clearInterval(manualIntervalRef.current);
      manualIntervalRef.current = null;
    }
    if (connected && ready && !emergencyLatched) sendMotor(0, 0);
    setMessage('Stop requested. Motors are commanded to zero; the emergency-stop latch remains available.');
  };

  return (
    <section className="hardware-section" aria-labelledby="hardware-heading">
      <div className="section-header">
        <h2 id="hardware-heading" className="section-title">Boat Hardware & Motor Safety</h2>
        <p className="section-subtitle">The browser connects only to a Nano attached to this computer; no remote server has a USB serial connection.</p>
      </div>
      <div className="hardware-card">
        <div className="hardware-topline">
          <div>
            <strong>Arduino Nano + TB6612FNG</strong>
            <span className={`hardware-status ${connected && ready ? 'is-connected' : 'is-disconnected'}`}>
              {connected ? (ready ? 'Serial ready' : 'Checking Arduino') : 'Disconnected'}
            </span>
          </div>
          {!connected ? (
            <button type="button" className="btn btn-primary" onClick={connectArduino} disabled={!supported}>Connect Arduino</button>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={disconnectArduino}>Disconnect</button>
          )}
        </div>
        {!supported && <p className="hardware-note">Web Serial is unavailable here. Use current Chrome or Edge over HTTPS (Vercel) or localhost.</p>}
        {serialError && <div className="hardware-error" role="alert">{serialError}</div>}
        <p className="hardware-message" aria-live="polite">{message}</p>
        <div className="hardware-telemetry">
          <div><span>Operational state</span><strong>{operationState}</strong></div>
          <div><span>Mode</span><strong>{emergencyLatched ? 'Emergency stop' : autoEnabled ? 'Supervised guidance' : 'Manual / stopped'}</strong></div>
          <div><span>Last command</span><strong>{lastCommand}</strong></div>
          <div><span>Arduino reply</span><strong>{lastReply}</strong></div>
          <div><span>Target · frame offset</span><strong>{currentTarget ? (() => {
            const x = (currentTarget.box.x_min + currentTarget.box.x_max) / 2;
            const y = (currentTarget.box.y_min + currentTarget.box.y_max) / 2;
            return `${currentTarget.class_name}${currentTarget.track_id ? ` #${currentTarget.track_id}` : ''} · ${(currentTarget.confidence * 100).toFixed(0)}% · Δx ${((x - 0.5) * 100).toFixed(0)}%, Δy ${((y - 0.5) * 100).toFixed(0)}%`;
          })() : 'No confident target'}</strong></div>
        </div>
        <div className="hardware-controls">
          <div className="hardware-manual">
            <h3>Manual test</h3>
            <p>Hold a direction button to move; release to stop. Bench-test with propellers removed or motors safely restrained.</p>
            <div className="hardware-throttle">
              <label htmlFor="motor-throttle">Conservative PWM limit: {throttle}/{MAX_PWM}</label>
              <input id="motor-throttle" type="range" min="20" max={MAX_PWM} step="5" value={throttle} onChange={(event) => setThrottle(Number(event.target.value))} disabled={!connected || !ready || autoEnabled || emergencyLatched} />
            </div>
            <label className="hardware-setting" htmlFor="target-selection-mode">Target selection</label>
            <select id="target-selection-mode" value={targetSelectionMode} onChange={(event) => setTargetSelectionMode(event.target.value)} disabled={autoEnabled}>
              <option value="stable_track">Keep stable track lock</option>
              <option value="highest_confidence">Highest confidence each frame</option>
            </select>
            <div className="hardware-drive-pad">
              {driveButton('Forward', 1, 1, 'drive-forward')}
              {driveButton('Turn left', 0.35, 1, 'drive-left')}
              {driveButton('Reverse', -1, -1, 'drive-reverse')}
              {driveButton('Turn right', 1, 0.35, 'drive-right')}
            </div>
          </div>
          <div className="hardware-guidance">
            <h3>Supervised target guidance</h3>
            <p>Uses the highest-confidence litter target at ≥{Math.round(Math.max(MIN_AUTONOMY_CONFIDENCE, confidenceThreshold) * 100)}%. It steers toward image center at low PWM; it does not detect obstacles or distance.</p>
            <div className="hardware-throttle">
              <label htmlFor="steering-tolerance">Center tolerance: ±{Math.round(steeringTolerance * 100)}% of frame width</label>
              <input id="steering-tolerance" type="range" min="0.04" max="0.20" step="0.01" value={steeringTolerance} onChange={(event) => setSteeringTolerance(Number(event.target.value))} disabled={autoEnabled || emergencyLatched} />
            </div>
            <p className="hardware-setting-note">Firmware command-loss timeout: {COMMAND_TIMEOUT_MS} ms (compile-time setting).</p>
            {!autoEnabled ? (
              <button type="button" className="btn btn-accent" onClick={enableSupervisedGuidance} disabled={!connected || !ready || emergencyLatched}>Enable supervised guidance</button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => { setAutoEnabled(false); sendMotor(0, 0); setMessage('Guidance disabled; motors stopped.'); }}>Disable guidance and stop</button>
            )}
          </div>
        </div>
        <div className="hardware-safety-actions">
          <button type="button" className="btn btn-secondary" onClick={stopMotors} disabled={!connected || !ready}>STOP MOTORS</button>
          <button type="button" className="btn btn-danger" onClick={emergencyStop} disabled={!connected}>EMERGENCY STOP</button>
          {emergencyLatched && <button type="button" className="btn btn-secondary" onClick={resetEmergencyStop} disabled={!connected || !ready}>Reset emergency latch</button>}
        </div>
        <div className="hardware-warning">
          <strong>Safety:</strong> This is supervised image-centering, not obstacle avoidance or safe navigation. Never test autonomous movement in open water or near people. Use a physical power cut-off, keep the boat restrained during bench tests, and rely on the Arduino timeout as the final communication-loss safeguard.
        </div>
      </div>
    </section>
  );
}
