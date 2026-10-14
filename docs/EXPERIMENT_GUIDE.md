# Clean Kadal — Scientific Experiment Guide

This guide describes how to conduct rigorous, repeatable physical experiments with your boat model and water tub setup.

---

## Experiment 1: Baseline Stationary Object Tracking & Noise Measurement

**Objective**: Quantify tracker jitter and false velocity readings when objects are stationary.

1. Fill the tub with water and allow it to become completely calm (no hand disturbances).
2. Place a plastic bottle floating stationary in the center of the tub.
3. Start the camera and click **Select Water Region**, dragging a rectangle around the water area.
4. Click **Select Reference Region (Tub Rim)**, dragging a rectangle over the fixed edge of the tub.
5. Click **Start Analysis**.
6. Click **Start Experiment Recording** and observe for 30 seconds.
7. Click **Stop Recording** and click **Export CSV**.
8. Inspect measured speed: for a stationary object in calm water, speed should hover near `0.000` to `0.005` norm units/sec.

---

## Experiment 2: Camera Motion Compensation Validation

**Objective**: Verify that camera-motion compensation subtracts boat bobbing from measured object tracks.

1. In calm water, gently push down on the floating boat model with your finger to induce rocking or bobbing.
2. Observe the **Camera Motion (Bobbing)** indicator on the Wave card.
3. Verify that:
   - When the tub rim reference is clearly visible, status shows **Compensated** (`successful` or `uncertain`).
   - The reported camera displacement $(dx, dy)$ reflects the boat's rocking frequency.
4. Compare object velocity with and without the reference ROI enabled.

---

## Experiment 3: Directional Hand-Wave Drift & Accumulation

**Objective**: Observe floating waste drift under unidirectional hand-generated waves and test whether accumulation hotspots form near tub walls.

1. Place 3 plastic items (bottle, cup, cap) floating near the center.
2. From the **left side** of the tub, create periodic hand ripples pushing waves toward the right wall.
3. Start Experiment Recording.
4. Run the experiment for 60 seconds until objects reach the right corner or wall.
5. Inspect the **Accumulation-Zone Grid (3x3)**:
   - Verify that column 3 (right wall) cells accumulate dwell time.
   - When dwell time exceeds 5 seconds and multiple objects settle in a cell, the cell transitions to **Hotspot (Observed Accumulation)**.
6. Export the session to JSON and CSV for your college report.

---

## Experiment 4: Trajectory Horizon Comparison (Baseline vs Wave-Informed)

**Objective**: Compare trajectory prediction errors between the constant-velocity model and the wave-informed model.

1. Induce steady surface wave motion.
2. Set the prediction horizon to `1.5 seconds`.
3. In Phase A (60s recording), set method to **Baseline Constant-Velocity**.
4. Export CSV: review `euclidean_error` in the prediction error log.
5. In Phase B (60s recording), set method to **Experimental Wave-Informed**.
6. Export CSV: compare the mean prediction error between the two approaches.
