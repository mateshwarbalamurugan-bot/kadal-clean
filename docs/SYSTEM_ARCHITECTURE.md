# Clean Kadal — System Architecture & Physical Model

## 1. Physical Setup

Clean Kadal is designed for a laboratory/classroom physical working model:
- **Floating Vessel**: A stationary miniature boat model floating in a rectangular tub of water.
- **Sensor**: A standard USB webcam mounted physically to the boat frame, angled forward and downward toward the water surface in front of the boat.
- **Wave Generation**: Waves are generated manually by hand from different sides of the tub to create realistic disturbances and surface rippling.
- **Physical Objects**: Real floating litter items (PET plastic bottles, plastic cups, snack wrappers, plastic bags, bottle caps) and biological comparison debris (fallen leaves).
- **Processing Station**: A student laptop running the Clean Kadal software platform.

```
+--------------------------------------------------------------+
|                     RECTANGULAR WATER TUB                    |
|                                                              |
|   [Wave Source: Hand Disturbance]                            |
|          ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~                       |
|                                                              |
|       +-------------------+          [Floating Waste]        |
|       |  STATIONARY BOAT  |            - Plastic Bottle      |
|       |  +-------------+  |            - Cup                 |
|       |  | USB Webcam  |==+========>   - Wrapper, Bag, Leaf  |
|       |  +-------------+  |                                  |
|       +-------------------+                                  |
|               |                                              |
|               | (USB Cable)                                  |
|               v                                              |
|       +---------------------------------------------+        |
|       |         STUDENT PROCESSING LAPTOP           |        |
|       |  - React + Vite Scientific Dashboard        |        |
|       |  - Python FastAPI + OpenCV + YOLO Backend   |        |
|       +---------------------------------------------+        |
+--------------------------------------------------------------+
```

---

## 2. Software Architecture

The software architecture separates object detection, camera motion compensation, wave propagation estimation, trajectory prediction, and accumulation analysis into distinct modular components.

```
                      +-----------------------------+
                      |   Browser Webcam API        |
                      +--------------+--------------+
                                     | (Base64 JPEG Frame)
                                     v
+------------------------------------+------------------------------------+
|                         FASTAPI BACKEND                                 |
|                                                                         |
|  1. Object Detector (Ultralytics YOLO / OpenCV)                         |
|     - Custom detector or baseline COCO model                            |
|     - Litter candidate categorization                                   |
|                                                                         |
|  2. Camera Motion Estimator (cv2.calcOpticalFlowPyrLK + RANSAC)         |
|     - Tracks user-selected stationary reference ROI (tub rim)           |
|     - Estimates boat bobbing displacement (dx, dy) and roll             |
|                                                                         |
|  3. Wave Pattern Analyzer (cv2.calcOpticalFlowFarneback)                |
|     - Selected water surface ROI minus object masks                     |
|     - Subtracts estimated camera displacement                           |
|     - Computes dominant vector, coherence, and reliability status       |
|                                                                         |
|  4. Object Tracker (Centroid Association & History Buffer)              |
|     - Maintains track IDs, normalized coords, and duration              |
|                                                                         |
|  5. Trajectory Predictor                                                |
|     - Model A: Baseline Constant-Velocity Projection                    |
|     - Model B: Experimental Wave-Informed Trajectory Coupling           |
|     - Real-time empirical error evaluation                              |
|                                                                         |
|  6. Accumulation Zone Analyzer (3x3 Grid)                               |
|     - Dwell time computation per spatial cell                           |
|     - Identifies observed hotspots, candidates, and corner traps        |
+------------------------------------+------------------------------------+
                                     |
                                     v (JSON Telemetry Response)
+------------------------------------+------------------------------------+
|                   REACT + VITE RESEARCH DASHBOARD                       |
|  - Live video canvas with bounding boxes, motion trails, vector arrows  |
|  - Detected objects table with confidence, velocity, and reliability    |
|  - Wave propagation card with camera compensation & wind disclaimers    |
|  - Trajectory forecast comparison & prediction error logs               |
|  - 3x3 accumulation matrix heatmap                                      |
|  - Experiment session recorder with genuine CSV & JSON telemetry export |
+-------------------------------------------------------------------------+
```

---

## 3. Distinction of Physical Quantities

Clean Kadal strictly distinguishes four physical quantities that are often erroneously conflated in simple computer vision projects:

1. **Surface Wave-Pattern Propagation**: The apparent directional propagation of visible capillary and gravity wave crests on the water surface, captured optically via gradient optical flow.
2. **Bulk Surface-Current Velocity**: The physical mass transport velocity of the water body itself. Optical flow on ripples does not directly measure Eulerian bulk current velocity.
3. **Floating-Object Drift**: The actual kinematic drift of a floating object, determined by hydrodynamic drag, object buoyancy, inertia, and surface tension.
4. **Wind Direction**: Atmospheric air movement above the water. A camera cannot measure wind direction; this is clearly labeled as unmeasured unless manually recorded by the student researcher.
