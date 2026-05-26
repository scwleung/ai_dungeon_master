"""Procedural BSP dungeon generator with fog-of-war support."""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Optional

# ---------------------------------------------------------------------------
# Tile constants
# ---------------------------------------------------------------------------

WALL = 0
FLOOR = 1
CORRIDOR = 2

# Room type constants
ROOM_ENTRANCE = "entrance"
ROOM_BOSS = "boss"
ROOM_TREASURE = "treasure"
ROOM_GENERIC = "generic"

# Curated name pools per room type
_NAMES: dict[str, list[str]] = {
    ROOM_ENTRANCE: [
        "The Entry Hall", "The Gatehouse", "The Threshold",
        "The Foyer", "The Vestibule", "The Antechamber",
        "The Gateway", "The Arrival Chamber",
    ],
    ROOM_BOSS: [
        "The Throne Room", "The Dragon's Lair", "The Dark Sanctum",
        "The Overlord's Chamber", "The Final Vault", "The Den of Chaos",
        "The Lair of Shadows", "The Warlord's Keep",
    ],
    ROOM_TREASURE: [
        "The Treasury", "The Vault", "The Hoard Room",
        "The Cache", "The Sanctum of Riches", "The Forbidden Alcove",
        "The Gilded Chamber", "The Storehouse of Ages",
    ],
    ROOM_GENERIC: [
        "The Barracks", "The Crypts", "The Library", "The Chapel",
        "The Armory", "The Kitchen", "The Torture Chamber", "The Observatory",
        "The Study", "The Ritual Circle", "The Cellar", "The Guard Room",
        "The Servants' Quarters", "The Meeting Hall", "The Trophy Room",
        "The Conjuring Chamber", "The Dungeon Cell", "The Forge",
        "The Alchemist's Lab", "The Shrine",
    ],
}


# ---------------------------------------------------------------------------
# BSP tree node
# ---------------------------------------------------------------------------


@dataclass
class _BSPNode:
    x: int
    y: int
    w: int
    h: int
    left: Optional["_BSPNode"] = None
    right: Optional["_BSPNode"] = None
    room: Optional[dict] = None

    @property
    def is_leaf(self) -> bool:
        return self.left is None and self.right is None


# ---------------------------------------------------------------------------
# Generator
# ---------------------------------------------------------------------------


class DungeonGenerator:
    """BSP-based procedural dungeon generator.

    Splits the map into binary-partition sections, places one room per leaf,
    then connects all rooms with an L-shaped corridor MST (Kruskal's algorithm)
    so every room is reachable with no redundant edges.

    Args:
        width:         Grid columns (tiles).
        height:        Grid rows (tiles).
        seed:          RNG seed for reproducibility.
        min_room_size: Minimum room dimension in tiles (width or height).
        max_room_size: Maximum room dimension in tiles.
    """

    _MIN_SECTION = 10  # BSP section must exceed this to be split further

    def __init__(
        self,
        width: int = 60,
        height: int = 40,
        seed: int = 42,
        min_room_size: int = 5,
        max_room_size: int = 12,
    ) -> None:
        self.width = width
        self.height = height
        self.seed = seed
        self.min_room_size = min_room_size
        self.max_room_size = max_room_size
        self.rng = random.Random(seed)

    def generate(self) -> dict:
        """Return a map_data dict ready for JSON-serialisation onto Campaign.map_data."""
        grid: list[list[int]] = [[WALL] * self.width for _ in range(self.height)]

        # BSP tree
        root = _BSPNode(1, 1, self.width - 2, self.height - 2)
        self._split(root)

        # Collect rooms from leaf nodes
        rooms: list[dict] = []
        self._collect_rooms(root, grid, rooms)

        # Assign room types and unique names
        self._assign_types(rooms)

        # Connect with MST corridors
        self._connect_rooms(rooms, grid)

        return {
            "seed": self.seed,
            "width": self.width,
            "height": self.height,
            "grid": grid,
            "rooms": rooms,
            "explored_rooms": [],
        }

    # ------------------------------------------------------------------
    # BSP splitting
    # ------------------------------------------------------------------

    def _split(self, node: _BSPNode, depth: int = 0) -> None:
        too_deep = depth > 5
        too_narrow_h = node.w < self._MIN_SECTION * 2
        too_narrow_v = node.h < self._MIN_SECTION * 2

        if too_deep or (too_narrow_h and too_narrow_v):
            return

        # Prefer splitting along the longer axis
        if node.w > node.h and not too_narrow_h:
            horizontal = False
        elif node.h > node.w and not too_narrow_v:
            horizontal = True
        elif not too_narrow_v:
            horizontal = True
        else:
            horizontal = False

        if horizontal:
            if node.h < self._MIN_SECTION * 2:
                return
            split_at = self.rng.randint(self._MIN_SECTION, node.h - self._MIN_SECTION)
            node.left = _BSPNode(node.x, node.y, node.w, split_at)
            node.right = _BSPNode(node.x, node.y + split_at, node.w, node.h - split_at)
        else:
            if node.w < self._MIN_SECTION * 2:
                return
            split_at = self.rng.randint(self._MIN_SECTION, node.w - self._MIN_SECTION)
            node.left = _BSPNode(node.x, node.y, split_at, node.h)
            node.right = _BSPNode(node.x + split_at, node.y, node.w - split_at, node.h)

        self._split(node.left, depth + 1)
        self._split(node.right, depth + 1)

    # ------------------------------------------------------------------
    # Room placement
    # ------------------------------------------------------------------

    def _collect_rooms(
        self, node: _BSPNode, grid: list[list[int]], rooms: list[dict]
    ) -> None:
        if node.is_leaf:
            room = self._place_room(node, grid, len(rooms))
            if room is not None:
                node.room = room
                rooms.append(room)
        else:
            if node.left:
                self._collect_rooms(node.left, grid, rooms)
            if node.right:
                self._collect_rooms(node.right, grid, rooms)

    def _place_room(
        self, node: _BSPNode, grid: list[list[int]], index: int
    ) -> Optional[dict]:
        """Carve a randomly-sized room within the BSP node bounds."""
        max_w = min(self.max_room_size, node.w - 2)
        max_h = min(self.max_room_size, node.h - 2)

        if max_w < self.min_room_size or max_h < self.min_room_size:
            return None

        rw = self.rng.randint(self.min_room_size, max_w)
        rh = self.rng.randint(self.min_room_size, max_h)

        # Random offset within the node, keeping one tile margin from edges
        rx = node.x + self.rng.randint(1, max(1, node.w - rw - 1))
        ry = node.y + self.rng.randint(1, max(1, node.h - rh - 1))

        # Clamp to grid interior
        rx = max(1, min(rx, self.width - rw - 1))
        ry = max(1, min(ry, self.height - rh - 1))

        for y in range(ry, ry + rh):
            for x in range(rx, rx + rw):
                grid[y][x] = FLOOR

        return {
            "id": f"room_{index}",
            "name": "",
            "type": ROOM_GENERIC,
            "x": rx,
            "y": ry,
            "w": rw,
            "h": rh,
        }

    # ------------------------------------------------------------------
    # Type and name assignment
    # ------------------------------------------------------------------

    def _assign_types(self, rooms: list[dict]) -> None:
        if not rooms:
            return

        # First room is the entrance; last is the boss lair
        rooms[0]["type"] = ROOM_ENTRANCE
        if len(rooms) > 1:
            rooms[-1]["type"] = ROOM_BOSS

        # Up to 2 treasure rooms among the middle rooms
        middle = rooms[1:-1] if len(rooms) > 2 else []
        self.rng.shuffle(middle)
        treasure_count = min(2, len(middle))
        for i, room in enumerate(middle):
            room["type"] = ROOM_TREASURE if i < treasure_count else ROOM_GENERIC

        # Assign unique names within each type
        used: dict[str, list[str]] = {t: [] for t in _NAMES}
        for room in rooms:
            rtype = room["type"]
            pool = [n for n in _NAMES[rtype] if n not in used[rtype]]
            if not pool:
                pool = list(_NAMES[rtype])
            name = self.rng.choice(pool)
            used[rtype].append(name)
            room["name"] = name

    # ------------------------------------------------------------------
    # MST corridor carving (Kruskal's)
    # ------------------------------------------------------------------

    def _connect_rooms(self, rooms: list[dict], grid: list[list[int]]) -> None:
        if len(rooms) < 2:
            return

        # Build all edges sorted by Manhattan distance between room centres
        edges: list[tuple[int, int, int]] = []
        for i in range(len(rooms)):
            for j in range(i + 1, len(rooms)):
                cx_i, cy_i = self._room_center(rooms[i])
                cx_j, cy_j = self._room_center(rooms[j])
                dist = abs(cx_i - cx_j) + abs(cy_i - cy_j)
                edges.append((i, j, dist))
        edges.sort(key=lambda e: e[2])

        # Union-find
        parent = list(range(len(rooms)))

        def find(x: int) -> int:
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a: int, b: int) -> bool:
            ra, rb = find(a), find(b)
            if ra == rb:
                return False
            parent[ra] = rb
            return True

        for i, j, _ in edges:
            if union(i, j):
                self._carve_corridor(
                    self._room_center(rooms[i]),
                    self._room_center(rooms[j]),
                    grid,
                )

    @staticmethod
    def _room_center(room: dict) -> tuple[int, int]:
        return room["x"] + room["w"] // 2, room["y"] + room["h"] // 2

    def _carve_corridor(
        self,
        a: tuple[int, int],
        b: tuple[int, int],
        grid: list[list[int]],
    ) -> None:
        """Carve an L-shaped 1-tile-wide corridor between two centre points."""
        ax, ay = a
        bx, by = b

        if self.rng.random() < 0.5:
            # Horizontal leg first, then vertical
            self._carve_h(ay, ax, bx, grid)
            self._carve_v(bx, ay, by, grid)
        else:
            # Vertical leg first, then horizontal
            self._carve_v(ax, ay, by, grid)
            self._carve_h(by, ax, bx, grid)

    def _carve_h(self, y: int, x1: int, x2: int, grid: list[list[int]]) -> None:
        for x in range(min(x1, x2), max(x1, x2) + 1):
            if 0 < y < self.height - 1 and 0 < x < self.width - 1:
                if grid[y][x] == WALL:
                    grid[y][x] = CORRIDOR

    def _carve_v(self, x: int, y1: int, y2: int, grid: list[list[int]]) -> None:
        for y in range(min(y1, y2), max(y1, y2) + 1):
            if 0 < y < self.height - 1 and 0 < x < self.width - 1:
                if grid[y][x] == WALL:
                    grid[y][x] = CORRIDOR


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def generate_dungeon(
    width: int = 60,
    height: int = 40,
    seed: Optional[int] = None,
    min_room_size: int = 5,
    max_room_size: int = 12,
) -> dict:
    """Generate a new dungeon and return a JSON-serialisable dict.

    Args:
        width:         Tile columns (default 60).
        height:        Tile rows (default 40).
        seed:          RNG seed; random if ``None``.
        min_room_size: Minimum room dimension in tiles.
        max_room_size: Maximum room dimension in tiles.

    Returns:
        Dict with keys ``seed``, ``width``, ``height``, ``grid``, ``rooms``,
        and ``explored_rooms`` (initially empty list).
    """
    if seed is None:
        seed = random.randint(0, 2**31 - 1)
    return DungeonGenerator(
        width=width,
        height=height,
        seed=seed,
        min_room_size=min_room_size,
        max_room_size=max_room_size,
    ).generate()
