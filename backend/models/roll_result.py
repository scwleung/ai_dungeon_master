import random
import re
from dataclasses import dataclass, field


@dataclass
class RollResult:
    """Represents the result of a dice roll."""

    dice: str           # e.g. "2d6+3"
    values: list[int]   # individual die values
    modifier: int       # flat modifier (positive or negative)
    total: int
    reason: str
    secret: bool = False


def roll_dice(notation: str, reason: str = "", secret: bool = False) -> RollResult:
    """
    Parse and roll dice notation like "2d6+3", "1d20", "4d8", "d6", "1d20-2".

    Supports:
      - NdX         → roll N dice of X sides
      - NdX+M       → roll N dice of X sides, add modifier M
      - NdX-M       → roll N dice of X sides, subtract modifier M
      - dX          → shorthand for 1dX

    Args:
        notation: Dice notation string (case-insensitive).
        reason:   Human-readable description of what this roll determines.
        secret:   Whether players should not see this roll result.

    Returns:
        RollResult with individual values, modifier, and total.

    Raises:
        ValueError: If the notation cannot be parsed.
    """
    notation = notation.strip().lower()

    # Pattern: optional N, 'd', X sides, optional +/- modifier
    pattern = r"^(\d+)?d(\d+)([+-]\d+)?$"
    match = re.match(pattern, notation)
    if not match:
        raise ValueError(f"Invalid dice notation: '{notation}'. Expected format like '2d6+3' or '1d20'.")

    num_dice = int(match.group(1)) if match.group(1) else 1
    sides = int(match.group(2))
    modifier_str = match.group(3)
    modifier = int(modifier_str) if modifier_str else 0

    if num_dice < 1:
        raise ValueError(f"Number of dice must be at least 1, got {num_dice}.")
    if sides < 2:
        raise ValueError(f"Number of sides must be at least 2, got {sides}.")
    if num_dice > 100:
        raise ValueError(f"Cannot roll more than 100 dice at once, got {num_dice}.")

    values = [random.randint(1, sides) for _ in range(num_dice)]
    total = sum(values) + modifier

    return RollResult(
        dice=notation,
        values=values,
        modifier=modifier,
        total=total,
        reason=reason,
        secret=secret,
    )
