"""Tests for the roll_dice function in backend.models.roll_result."""
import pytest

from backend.models.roll_result import roll_dice


def test_basic_1d6_total_in_range():
    result = roll_dice("1d6")
    assert 1 <= result.total <= 6


def test_basic_1d6_single_value():
    result = roll_dice("1d6")
    assert len(result.values) == 1


def test_basic_1d6_modifier_is_zero():
    result = roll_dice("1d6")
    assert result.modifier == 0


def test_2d6_total_in_range():
    result = roll_dice("2d6")
    assert 2 <= result.total <= 12


def test_2d6_has_two_values():
    result = roll_dice("2d6")
    assert len(result.values) == 2


def test_1d20_plus_5_modifier():
    result = roll_dice("1d20+5")
    assert result.modifier == 5


def test_1d20_plus_5_total_equals_value_plus_modifier():
    result = roll_dice("1d20+5")
    assert result.total == result.values[0] + 5


def test_1d20_minus_2_modifier():
    result = roll_dice("1d20-2")
    assert result.modifier == -2


def test_1d20_minus_2_total_equals_value_plus_modifier():
    result = roll_dice("1d20-2")
    assert result.total == result.values[0] - 2


def test_d20_shorthand_total_in_range():
    result = roll_dice("d20")
    assert 1 <= result.total <= 20


def test_secret_true():
    result = roll_dice("1d6", secret=True)
    assert result.secret is True


def test_secret_defaults_false():
    result = roll_dice("1d6")
    assert result.secret is False


def test_reason_stored():
    result = roll_dice("1d6", reason="attack")
    assert result.reason == "attack"


def test_invalid_notation_raises_value_error():
    with pytest.raises(ValueError):
        roll_dice("invalid")


def test_too_many_dice_raises_value_error():
    with pytest.raises(ValueError):
        roll_dice("101d6")


def test_too_few_sides_raises_value_error():
    with pytest.raises(ValueError):
        roll_dice("1d1")


def test_zero_dice_raises_value_error():
    with pytest.raises(ValueError):
        roll_dice("0d6")


def test_values_always_within_die_range():
    for _ in range(20):
        result = roll_dice("4d8")
        for v in result.values:
            assert 1 <= v <= 8


def test_total_equals_sum_of_values_plus_modifier():
    result = roll_dice("3d6+4")
    assert result.total == sum(result.values) + result.modifier


def test_dice_notation_stored_lowercased():
    result = roll_dice("2d6+3")
    assert result.dice == "2d6+3"


def test_dice_notation_input_case_insensitive():
    result = roll_dice("2D6+3")
    assert result.dice == "2d6+3"
