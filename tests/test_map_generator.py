"""Unit tests for backend/services/map_generator.py."""

import pytest

from backend.services.map_generator import (
    CORRIDOR,
    FLOOR,
    ROOM_BOSS,
    ROOM_ENTRANCE,
    ROOM_GENERIC,
    ROOM_TREASURE,
    WALL,
    DungeonGenerator,
    generate_dungeon,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _gen(seed: int = 42, width: int = 60, height: int = 40) -> dict:
    return generate_dungeon(width=width, height=height, seed=seed)


# ---------------------------------------------------------------------------
# Basic structure
# ---------------------------------------------------------------------------


def test_generate_returns_required_keys():
    data = _gen()
    assert "width" in data
    assert "height" in data
    assert "grid" in data
    assert "rooms" in data
    assert "explored_rooms" in data
    assert "seed" in data


def test_generate_correct_dimensions():
    data = _gen(width=60, height=40)
    assert data["width"] == 60
    assert data["height"] == 40
    assert len(data["grid"]) == 40
    assert all(len(row) == 60 for row in data["grid"])


def test_generate_explored_rooms_initially_empty():
    data = _gen()
    assert data["explored_rooms"] == []


def test_generate_seed_stored_in_output():
    data = generate_dungeon(seed=1234)
    assert data["seed"] == 1234


def test_generate_random_seed_used_when_none():
    data = generate_dungeon(seed=None)
    assert isinstance(data["seed"], int)


# ---------------------------------------------------------------------------
# Reproducibility
# ---------------------------------------------------------------------------


def test_same_seed_produces_identical_maps():
    a = _gen(seed=7)
    b = _gen(seed=7)
    assert a["grid"] == b["grid"]
    assert a["rooms"] == b["rooms"]


def test_different_seeds_produce_different_maps():
    a = _gen(seed=1)
    b = _gen(seed=2)
    # Grids are almost certainly different for different seeds
    assert a["grid"] != b["grid"] or a["rooms"] != b["rooms"]


# ---------------------------------------------------------------------------
# Room constraints
# ---------------------------------------------------------------------------


def test_generates_at_least_one_room():
    data = _gen()
    assert len(data["rooms"]) >= 1


def test_rooms_have_required_fields():
    data = _gen()
    for room in data["rooms"]:
        assert "id" in room
        assert "name" in room
        assert "type" in room
        assert "x" in room
        assert "y" in room
        assert "w" in room
        assert "h" in room


def test_room_ids_are_unique():
    data = _gen()
    ids = [r["id"] for r in data["rooms"]]
    assert len(ids) == len(set(ids))


def test_room_names_are_non_empty():
    data = _gen()
    for room in data["rooms"]:
        assert room["name"], f"Room {room['id']} has an empty name"


def test_rooms_within_grid_bounds():
    data = _gen()
    w, h = data["width"], data["height"]
    for room in data["rooms"]:
        assert room["x"] >= 0
        assert room["y"] >= 0
        assert room["x"] + room["w"] <= w
        assert room["y"] + room["h"] <= h


def test_room_sizes_respect_min_size():
    data = _gen()
    for room in data["rooms"]:
        assert room["w"] >= 5
        assert room["h"] >= 5


def test_room_sizes_respect_max_size():
    data = _gen()
    for room in data["rooms"]:
        assert room["w"] <= 12
        assert room["h"] <= 12


# ---------------------------------------------------------------------------
# Room type assignment
# ---------------------------------------------------------------------------


def test_first_room_is_entrance():
    data = _gen()
    if data["rooms"]:
        assert data["rooms"][0]["type"] == ROOM_ENTRANCE


def test_last_room_is_boss_when_multiple_rooms():
    data = _gen()
    if len(data["rooms"]) >= 2:
        assert data["rooms"][-1]["type"] == ROOM_BOSS


def test_valid_room_types():
    data = _gen()
    valid = {ROOM_ENTRANCE, ROOM_BOSS, ROOM_TREASURE, ROOM_GENERIC}
    for room in data["rooms"]:
        assert room["type"] in valid


def test_exactly_one_entrance():
    data = _gen()
    entrances = [r for r in data["rooms"] if r["type"] == ROOM_ENTRANCE]
    assert len(entrances) == 1


def test_exactly_one_boss_when_multiple_rooms():
    data = _gen()
    if len(data["rooms"]) >= 2:
        bosses = [r for r in data["rooms"] if r["type"] == ROOM_BOSS]
        assert len(bosses) == 1


def test_at_most_two_treasure_rooms():
    data = _gen()
    treasures = [r for r in data["rooms"] if r["type"] == ROOM_TREASURE]
    assert len(treasures) <= 2


# ---------------------------------------------------------------------------
# Tile values
# ---------------------------------------------------------------------------


def test_tile_constant_values():
    assert WALL == 0
    assert FLOOR == 1
    assert CORRIDOR == 2


def test_grid_contains_only_valid_tile_values():
    data = _gen()
    valid = {WALL, FLOOR, CORRIDOR}
    for row in data["grid"]:
        for tile in row:
            assert tile in valid


def test_room_tiles_are_floor():
    data = _gen()
    grid = data["grid"]
    for room in data["rooms"]:
        for y in range(room["y"], room["y"] + room["h"]):
            for x in range(room["x"], room["x"] + room["w"]):
                assert grid[y][x] == FLOOR, (
                    f"Tile at ({x},{y}) in room {room['id']} is not FLOOR"
                )


def test_map_border_is_wall():
    data = _gen()
    grid = data["grid"]
    w, h = data["width"], data["height"]
    # Top and bottom rows
    assert all(grid[0][x] == WALL for x in range(w))
    assert all(grid[h - 1][x] == WALL for x in range(w))
    # Left and right columns
    assert all(grid[y][0] == WALL for y in range(h))
    assert all(grid[y][w - 1] == WALL for y in range(h))


# ---------------------------------------------------------------------------
# Corridor connectivity
# ---------------------------------------------------------------------------


def test_all_rooms_reachable_from_entrance():
    """All rooms can be reached from the entrance room via floor/corridor tiles."""
    data = _gen()
    if len(data["rooms"]) < 2:
        pytest.skip("Too few rooms to test connectivity")

    grid = data["grid"]
    entrance = data["rooms"][0]
    start = (entrance["x"] + entrance["w"] // 2, entrance["y"] + entrance["h"] // 2)

    # BFS over FLOOR + CORRIDOR tiles
    visited: set[tuple[int, int]] = set()
    queue = [start]
    visited.add(start)
    dirs = [(0, 1), (0, -1), (1, 0), (-1, 0)]
    while queue:
        x, y = queue.pop()
        for dx, dy in dirs:
            nx, ny = x + dx, y + dy
            if (nx, ny) not in visited and 0 <= nx < data["width"] and 0 <= ny < data["height"]:
                if grid[ny][nx] in (FLOOR, CORRIDOR):
                    visited.add((nx, ny))
                    queue.append((nx, ny))

    # Check that each room centre is reachable
    for room in data["rooms"]:
        cx, cy = room["x"] + room["w"] // 2, room["y"] + room["h"] // 2
        assert (cx, cy) in visited, f"Room {room['id']} ({room['name']}) is not reachable"


def test_corridors_exist_with_multiple_rooms():
    data = _gen()
    if len(data["rooms"]) >= 2:
        flat = [tile for row in data["grid"] for tile in row]
        assert CORRIDOR in flat


# ---------------------------------------------------------------------------
# Custom dimensions
# ---------------------------------------------------------------------------


def test_custom_dimensions():
    data = generate_dungeon(width=80, height=50, seed=99)
    assert data["width"] == 80
    assert data["height"] == 50
    assert len(data["grid"]) == 50
    assert all(len(row) == 80 for row in data["grid"])


def test_min_room_size_respected_custom():
    data = generate_dungeon(seed=5, min_room_size=4, max_room_size=8)
    for room in data["rooms"]:
        assert room["w"] >= 4
        assert room["h"] >= 4
