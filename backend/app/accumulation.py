"""
Clean Kadal — Accumulation-Zone Analysis Module
Divides the water region into a configurable 3x3 grid, analyzes object tracking histories
and dwell times, and identifies observed accumulation hotspots, tentative candidate zones,
and future predicted accumulation areas without fabricating data.
"""
from typing import Dict, List, Set, Optional
from .schemas import (
    BoundingBox,
    AccumulationCell,
    AccumulationAnalysisRequest,
    AccumulationAnalysisResponse,
    AccumulationTrackInput
)


class AccumulationAnalyzer:
    def __init__(self):
        pass

    def analyze(self, req: AccumulationAnalysisRequest) -> AccumulationAnalysisResponse:
        rows = req.grid_rows
        cols = req.grid_cols

        # Water region bounding box boundaries
        if req.water_region:
            wx_min = req.water_region.x_min
            wy_min = req.water_region.y_min
            wx_max = req.water_region.x_max
            wy_max = req.water_region.y_max
        else:
            wx_min, wy_min, wx_max, wy_max = 0.0, 0.0, 1.0, 1.0

        w_width = max(1e-4, wx_max - wx_min)
        w_height = max(1e-4, wy_max - wy_min)

        # Initialize grid cells
        grid: List[List[AccumulationCell]] = []
        for r in range(rows):
            row_cells = []
            for c in range(cols):
                # Perimeter cells are image-grid edges, not detected physical walls.
                is_wall = (r == 0 or r == rows - 1 or c == 0 or c == cols - 1)
                row_cells.append(AccumulationCell(
                    row=r,
                    col=c,
                    unique_objects_count=0,
                    total_dwell_time_sec=0.0,
                    entry_count=0,
                    classification="none",
                    is_corner_or_wall=is_wall
                ))
            grid.append(row_cells)

        if not req.tracks:
            return AccumulationAnalysisResponse(
                grid=grid,
                summary_status="insufficient_data",
                message="Insufficient data to identify accumulation. No object tracks recorded.",
                hotspots_count=0,
                dominant_zone=None
            )

        # Helper to map normalized coordinates (x, y) to (row, col)
        def get_cell(x: float, y: float) -> Optional[tuple[int, int]]:
            if not (wx_min <= x <= wx_max and wy_min <= y <= wy_max):
                return None
            rel_x = (x - wx_min) / w_width
            rel_y = (y - wy_min) / w_height
            col_idx = min(cols - 1, max(0, int(rel_x * cols)))
            row_idx = min(rows - 1, max(0, int(rel_y * rows)))
            return row_idx, col_idx

        # Track stats per cell: cell -> (set of track_ids, dwell_time, entries)
        cell_objects: Dict[tuple[int, int], Set[int]] = {}
        cell_dwell: Dict[tuple[int, int], float] = {}
        cell_entries: Dict[tuple[int, int], int] = {}
        predicted_cells: Set[tuple[int, int]] = set()

        total_observations = 0

        for track in req.tracks:
            if not track.positions:
                continue

            sorted_pts = sorted(track.positions, key=lambda p: p.t)
            prev_cell: Optional[tuple[int, int]] = None
            prev_t = sorted_pts[0].t

            for pt in sorted_pts:
                total_observations += 1
                curr_cell = get_cell(pt.x, pt.y)
                dt = max(0.0, min(2.0, pt.t - prev_t))  # cap single step dt to 2s to prevent pauses
                prev_t = pt.t

                if curr_cell is not None:
                    if curr_cell not in cell_objects:
                        cell_objects[curr_cell] = set()
                        cell_dwell[curr_cell] = 0.0
                        cell_entries[curr_cell] = 0

                    cell_objects[curr_cell].add(track.track_id)
                    cell_dwell[curr_cell] += dt

                    if curr_cell != prev_cell:
                        cell_entries[curr_cell] += 1
                        prev_cell = curr_cell

            # Record predicted endpoint if available
            if track.predicted_position and len(track.predicted_position) >= 2:
                pred_cell = get_cell(track.predicted_position[0], track.predicted_position[1])
                if pred_cell:
                    predicted_cells.add(pred_cell)

        # Populate cell models and classify
        hotspots = 0
        max_dwell = 0.0
        dominant_cell_name = None

        for r in range(rows):
            for c in range(cols):
                coord = (r, c)
                uniq_count = len(cell_objects.get(coord, set()))
                dwell_sec = round(cell_dwell.get(coord, 0.0), 1)
                entries = cell_entries.get(coord, 0)

                # Classification logic
                if uniq_count >= req.threshold_unique_objects and dwell_sec >= req.threshold_dwell_sec:
                    classification = "observed_accumulation"
                    hotspots += 1
                elif dwell_sec >= 2.0 or (uniq_count >= 1 and entries >= 2):
                    classification = "tentative_candidate"
                elif coord in predicted_cells:
                    classification = "predicted_accumulation"
                else:
                    classification = "none"

                grid[r][c].unique_objects_count = uniq_count
                grid[r][c].total_dwell_time_sec = dwell_sec
                grid[r][c].entry_count = entries
                grid[r][c].classification = classification

                if dwell_sec > max_dwell:
                    max_dwell = dwell_sec
                    dominant_cell_name = f"Row {r+1}, Col {c+1} ({'Image Edge' if grid[r][c].is_corner_or_wall else 'Interior Image Area'})"

        # Check sufficiency of experimental evidence
        if total_observations < 10 or len(req.tracks) < 1:
            status = "insufficient_data"
            message = "Insufficient data to identify accumulation. Requires longer recording or more tracked objects."
        else:
            status = "sufficient_data"
            message = f"Analyzed {len(req.tracks)} tracks across {total_observations} observations. Found {hotspots} observed accumulation hotspots."

        return AccumulationAnalysisResponse(
            grid=grid,
            summary_status=status,
            message=message,
            hotspots_count=hotspots,
            dominant_zone=dominant_cell_name
        )
