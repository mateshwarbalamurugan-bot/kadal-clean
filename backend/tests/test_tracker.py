import pytest
from backend.app.tracker import ObjectTracker
from backend.app.schemas import Detection, BoundingBox


def test_tracker_lifecycle_and_id_maintenance():
    tracker = ObjectTracker(max_missed_frames=3)

    # Frame 1: bottle detected
    det1 = Detection(
        class_name="plastic_bottle",
        confidence=0.88,
        box=BoundingBox(x_min=0.2, y_min=0.2, x_max=0.3, y_max=0.3),
        is_litter_candidate=True,
        is_custom_class=True
    )
    t1 = 1000.0
    tracks1 = tracker.update([det1], timestamp=t1)

    assert len(tracks1) == 1
    assert tracks1[0].track_id == 1
    assert tracks1[0].class_name == "plastic_bottle"
    assert tracks1[0].track_duration_sec == 0.0

    # Frame 2: bottle moved slightly to x=0.22, y=0.21 at t=1001.0
    det2 = Detection(
        class_name="plastic_bottle",
        confidence=0.91,
        box=BoundingBox(x_min=0.22, y_min=0.21, x_max=0.32, y_max=0.31),
        is_litter_candidate=True,
        is_custom_class=True
    )
    t2 = 1001.0
    tracks2 = tracker.update([det2], timestamp=t2)

    assert len(tracks2) == 1
    assert tracks2[0].track_id == 1  # ID preserved!
    assert tracks2[0].track_duration_sec == 1.0
    assert len(tracks2[0].history) == 2

    # Frame 3, 4, 5: missing detections
    tracker.update([], timestamp=1002.0)
    tracker.update([], timestamp=1003.0)
    tracker.update([], timestamp=1004.0)

    # By frame 6 (4th missed frame > max_missed_frames=3), track should be pruned
    tracks_after = tracker.update([], timestamp=1005.0)
    assert len(tracks_after) == 0
    assert 1 not in tracker.active_tracks


def test_tracker_reset():
    tracker = ObjectTracker()
    det = Detection(
        class_name="bottle",
        confidence=0.85,
        box=BoundingBox(x_min=0.1, y_min=0.1, x_max=0.2, y_max=0.2),
        is_litter_candidate=True,
        is_custom_class=False
    )
    tracker.update([det], timestamp=10.0)
    assert len(tracker.active_tracks) == 1

    tracker.reset()
    assert len(tracker.active_tracks) == 0
    assert tracker.next_track_id == 1
