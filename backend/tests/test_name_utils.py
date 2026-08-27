"""Unit tests for general team identity (org + branch) matching."""

from __future__ import annotations

import unittest

from app.name_utils import (
    draft_seat_matches,
    identities_match,
    resolve_team_identity,
    roster_display_name,
    seat_maps_to_opponent,
    team_branch_key,
    team_display_label,
    team_names_match,
    team_org_base,
)
from app.models import TournamentMatchRow
from app.tournament_dataset import _team_matches_row


class TeamOrgBaseTests(unittest.TestCase):
    def test_strips_branch(self) -> None:
        self.assertEqual(team_org_base("Onimaru Vanguard"), "onimaru")
        self.assertEqual(team_org_base("Onimaru Capybaras"), "onimaru")
        self.assertEqual(team_org_base("Onimaru_Esports"), "onimaru")
        self.assertEqual(team_org_base("Oni.Barbetacos"), "oni")
        self.assertEqual(team_org_base("Wonders B"), "wonders")


class BranchKeyTests(unittest.TestCase):
    def test_word_and_letter_branches(self) -> None:
        self.assertEqual(team_branch_key("Oni.Barbetacos"), "barbetacos")
        self.assertEqual(team_branch_key("Onimaru Vanguard"), "vanguard")
        self.assertEqual(team_branch_key("Wonders B"), "b")
        self.assertEqual(team_branch_key("Darkside L"), "l")

    def test_short_roster_letters(self) -> None:
        self.assertEqual(team_branch_key("NOC A"), "")
        self.assertEqual(team_branch_key("NOC B"), "b")
        self.assertEqual(team_branch_key("Noc B"), "b")


class IdentityTests(unittest.TestCase):
    def test_umbrella_splits_by_seat(self) -> None:
        main = resolve_team_identity(lp_name="DarkSidE", seat_name="DS")
        sub = resolve_team_identity(lp_name="DarkSidE", seat_name="Darkside L")
        self.assertEqual(main.branch, "")
        self.assertEqual(sub.branch, "l")
        self.assertFalse(identities_match(main, sub))

    def test_onimaru_subrosters(self) -> None:
        v = resolve_team_identity(lp_name="Onimaru_Esports", seat_name="Onimaru Vanguard")
        c = resolve_team_identity(lp_name="Onimaru_Esports", seat_name="Onimaru Capybaras")
        self.assertFalse(identities_match(v, c))
        self.assertTrue(
            identities_match(
                v, resolve_team_identity(lp_name="Onimaru Vanguard", seat_name="Oni Vanguard")
            )
        )

    def test_wonders_b_separate_from_main(self) -> None:
        main = resolve_team_identity(lp_name="Wonders")
        b = resolve_team_identity(lp_name="Wonders B")
        self.assertFalse(identities_match(main, b))

    def test_nocturna_b_separate(self) -> None:
        main = resolve_team_identity(lp_name="Nocturna_eSports", seat_name="NOC A")
        b = resolve_team_identity(lp_name="Nocturna_eSports_B", seat_name="NOC B")
        self.assertFalse(identities_match(main, b))


class TeamNamesMatchTests(unittest.TestCase):
    def test_keeps_subteams_apart(self) -> None:
        self.assertFalse(team_names_match("Onimaru Vanguard", "Onimaru Capybaras"))
        self.assertFalse(team_names_match("Wonders", "Wonders B"))
        self.assertFalse(team_names_match("Nocturna_eSports", "Nocturna_eSports_B"))

    def test_plural_branch_compatible(self) -> None:
        self.assertTrue(team_names_match("Onimaru Vanguard", "Onimaru Vanguards"))


class DisplayTests(unittest.TestCase):
    def test_general_display(self) -> None:
        self.assertEqual(
            team_display_label(lp_name="Onimaru_Esports", seat_name="Onimaru Vanguard"),
            "Onimaru Vanguard",
        )
        self.assertEqual(
            team_display_label(lp_name="DarkSidE", seat_name="Darkside L"),
            "Darkside L",
        )
        self.assertEqual(
            team_display_label(lp_name="Wonders B", seat_name="Wonders B"),
            "Wonders B",
        )
        self.assertEqual(
            team_display_label(lp_name="Nocturna_eSports_B", seat_name="NOC B"),
            "Nocturna eSports B",
        )

    def test_roster_alias(self) -> None:
        self.assertEqual(roster_display_name("Oni.Barbetacos", "Onimaru_Esports"), "Oni Barbetacos")


class SeatMappingTests(unittest.TestCase):
    def test_umbrella_accepts_subroster_seats(self) -> None:
        self.assertTrue(seat_maps_to_opponent("Onimaru Vanguard", "Onimaru_Esports"))
        self.assertTrue(seat_maps_to_opponent("Darkside L", "DarkSidE"))
        self.assertTrue(seat_maps_to_opponent("Wonders B", "Wonders"))

    def test_strict_identity_rejects_cross_branch(self) -> None:
        self.assertFalse(draft_seat_matches("Onimaru Vanguard", "Onimaru_Esports"))
        self.assertFalse(draft_seat_matches("Darkside L", "DarkSidE"))
        self.assertFalse(draft_seat_matches("NOC B", "Nocturna_eSports"))
        self.assertTrue(draft_seat_matches("NOC A", "Nocturna_eSports"))


class TeamMatchesRowTests(unittest.TestCase):
    def _row(self, o1, o2, s1=None, s2=None):
        return TournamentMatchRow(
            id="1",
            dataset_slug="x",
            match_key="k",
            opponent1=o1,
            opponent2=o2,
            seat1=s1,
            seat2=s2,
        )

    def test_generic_main_excludes_letter_branch(self) -> None:
        self.assertIsNone(
            _team_matches_row(self._row("DarkSidE", "LingYuan", "Darkside L", "LY"), "DarkSidE")
        )
        self.assertEqual(
            _team_matches_row(self._row("Wonders", "SalzZ", "Wonders B", "SalzZ"), "Wonders"),
            None,
        )
        self.assertEqual(
            _team_matches_row(self._row("Wonders B", "SalzZ", "Wonders B", "SalzZ"), "Wonders B"),
            1,
        )

    def test_nocturna_and_onimaru(self) -> None:
        self.assertEqual(
            _team_matches_row(
                self._row("Nocturna_eSports", "SalzZ", "NOC A", "SalzZ"), "Nocturna_eSports"
            ),
            1,
        )
        self.assertIsNone(
            _team_matches_row(
                self._row("Nocturna_eSports_B", "SalzZ", "NOC B", "SalzZ"), "Nocturna_eSports"
            )
        )
        self.assertEqual(
            _team_matches_row(
                self._row("Onimaru_Esports", "SalzZ", "Onimaru Vanguard", "SalzZ"),
                "Onimaru Vanguard",
            ),
            1,
        )
        self.assertIsNone(
            _team_matches_row(
                self._row("Onimaru_Esports", "SalzZ", "Onimaru Capybaras", "SalzZ"),
                "Onimaru Vanguard",
            )
        )


if __name__ == "__main__":
    unittest.main()
