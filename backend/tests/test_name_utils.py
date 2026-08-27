"""Unit tests for team / draft seat name matching."""

from __future__ import annotations

import unittest

from app.name_utils import (
    draft_seat_matches,
    team_branch_key,
    team_names_match,
    team_org_base,
)


class TeamOrgBaseTests(unittest.TestCase):
    def test_strips_branch(self) -> None:
        self.assertEqual(team_org_base("Onimaru Vanguard"), "onimaru")
        self.assertEqual(team_org_base("Onimaru Capybaras"), "onimaru")
        self.assertEqual(team_org_base("Onimaru_Esports"), "onimaru")
        self.assertEqual(team_org_base("Oni.Barbetacos"), "oni")
        self.assertEqual(team_org_base("Wonders B"), "wonders")


class BranchKeyTests(unittest.TestCase):
    def test_dot_separated_branch(self) -> None:
        self.assertEqual(team_branch_key("Oni.Barbetacos"), "barbetacos")
        self.assertEqual(team_branch_key("Onimaru Vanguard"), "vanguard")


class TeamNamesMatchTests(unittest.TestCase):
    def test_keeps_onimaru_subteams_apart(self) -> None:
        self.assertFalse(team_names_match("Onimaru Vanguard", "Onimaru Capybaras"))
        self.assertFalse(team_names_match("Wonders", "Wonders B"))

    def test_plural_branch_compatible(self) -> None:
        self.assertTrue(team_names_match("Onimaru Vanguard", "Onimaru Vanguards"))


class DraftSeatMatchTests(unittest.TestCase):
    def test_umbrella_matches_subrosters(self) -> None:
        org = "Onimaru_Esports"
        for seat in (
            "Onimaru Vanguard",
            "Onimaru Vanguards",
            "Oni Vanguard",
            "Onimaru Capybaras",
            "Onimaru Barbetacos",
            "Oni.Barbetacos",
        ):
            self.assertTrue(draft_seat_matches(seat, org), seat)

    def test_does_not_cross_merge_branched_orgs(self) -> None:
        self.assertFalse(draft_seat_matches("Onimaru Vanguard", "Onimaru Capybaras"))
        self.assertFalse(draft_seat_matches("Wonders B", "Wonders L"))

    def test_wonders_umbrella(self) -> None:
        self.assertTrue(draft_seat_matches("Wonders B", "Wonders"))
        self.assertTrue(draft_seat_matches("Wonders", "Wonders"))

    def test_short_roster_still_works(self) -> None:
        self.assertTrue(draft_seat_matches("NOC A", "Nocturna_eSports"))
        self.assertTrue(draft_seat_matches("NOC", "Nocturna eSports"))


if __name__ == "__main__":
    unittest.main()
