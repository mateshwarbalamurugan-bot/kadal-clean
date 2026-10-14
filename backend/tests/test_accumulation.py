import pytest
from backend.app.accumulation import AccumulationAnalyzer
from backend.app.schemas import (
    AccumulationAnalysisRequest,
    AccumulationTrackInput,
    TrackHistoryPoint,
    BoundingBox
)


def test_accumulation_empty_tracks():
    analyzer = AccumulationAnalyzer()
    req = AccumulationAnalysisRequest(
        grid_rows=3,
        grid_cols=3,
        tracks=[]
    )
    res = analyzer.analyze(req)
    assert res.summary_status == "insufficient_data"
    assert res.hotspots_count == 0
    assert len(res.grid) == 3
    assert len(res.grid[0]) == 3


def test_accumulation_single_transient_object():
    analyzer = AccumulationAnalyzer()
    # A single object simply transiting through cell (0, 0) for 1 second
    pts = [
        TrackHistoryPoint(t=0.0, x=0.05, y=0.05),
        TrackHistoryPoint(t=0.5, x=0.06, y=0.06),
        TrackHistoryPoint(t=1.0, x=0.07, y=0.07),
    ]
    req = AccumulationAnalysisRequest(
        grid_rows=3,
        grid_cols=3,
        tracks=[AccumulationTrackInput(track_id=1, positions=pts)],
        threshold_dwell_sec=5.0,
        threshold_unique_objects=2
    )
    res = analyzer.analyze(req)
    # A single transient object must NOT be labeled as observed accumulation
    cell_0_0 = res.grid[0][0]
    assert cell_0_0.classification != "observed_accumulation"
    assert res.hotspots_count == 0


def test_accumulation_multiple_lingering_objects():
    analyzer = AccumulationAnalyzer()
    # Track 1 lingering in top-left corner (0, 0) for 6 seconds
    pts1 = [TrackHistoryPoint(t=float(sec), x=0.05, y=0.05) for sec in range(7)]
    # Track 2 lingering in top-left corner (0, 0) for 6 seconds
    pts2 = [TrackHistoryPoint(t=float(sec), x=0.08, y=0.08) for sec in range(7)]
    # Track 3 elsewhere
    pts3 = [TrackHistoryPoint(t=float(sec), x=0.85, y=0.85) for sec in range(4)]

    req = AccumulationAnalysisRequest(
        grid_rows=3,
        grid_cols=3,
        tracks=[
            AccumulationTrackInput(track_id=1, positions=pts1),
            AccumulationTrackInput(track_id=2, positions=pts2),
            AccumulationTrackInput(track_id=3, positions=pts3),
        ],
        threshold_dwell_sec=5.0,
        threshold_unique_objects=2
    )
    res = analyzer.analyze(req)
    assert res.summary_status == "sufficient_data"
    cell_0_0 = res.grid[0][0]
    assert cell_0_0.unique_objects_count == 2
    assert cell_0_0.total_dwell_time_sec >= 5.0
    assert cell_0_0.classification == "observed_accumulation"
    assert cell_0_0.is_corner_or_wall is True
    assert res.hotspots_count >= 1
