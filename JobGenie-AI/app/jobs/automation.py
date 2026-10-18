"""Automation modes, the per-platform policy, and the kill switches.

Every platform/action pair declares exactly one mode. Whether something may happen automatically is
decided here, in one place, from three independent inputs: the platform's mode (from its published
terms, see docs/platform-compliance.md), the platform's own on/off switch, and the global switches.
An adapter cannot grant itself more than its policy row allows.
"""

import os
from dataclasses import dataclass
from enum import IntEnum
from typing import Dict, Optional, Set


class Mode(IntEnum):
    """Ordered by how much JobGenie is allowed to do on its own."""

    BLOCKED = 0
    DRAFT_ONLY = 1
    BROWSER_ASSISTED = 2
    HUMAN_APPROVAL = 3
    FULLY_AUTOMATED = 4


@dataclass(frozen=True)
class PlatformPolicy:
    platform: str
    search: Mode
    profile_update: Mode
    apply: Mode
    source_url: str
    reviewed_on: str
    notes: str = ""


# Seeded from docs/platform-compliance.md (researched 2026-10-06). Anything not listed is BLOCKED.
POLICIES: Dict[str, PlatformPolicy] = {
    p.platform: p
    for p in [
        PlatformPolicy("adzuna", Mode.FULLY_AUTOMATED, Mode.BLOCKED, Mode.BROWSER_ASSISTED, "https://developer.adzuna.com/docs/terms_of_service", "2026-10-06", "Official API; attribution required; 250 calls/day on the default key."),
        PlatformPolicy("greenhouse", Mode.FULLY_AUTOMATED, Mode.BLOCKED, Mode.BROWSER_ASSISTED, "https://docs.greenhouse.io/job-board.html", "2026-10-06", "Public job board API; applying needs the employer's key."),
        PlatformPolicy("lever", Mode.FULLY_AUTOMATED, Mode.BLOCKED, Mode.BROWSER_ASSISTED, "https://github.com/lever/postings-api", "2026-10-06", "Public postings API; applying needs the employer's key."),
        PlatformPolicy("ashby", Mode.FULLY_AUTOMATED, Mode.BLOCKED, Mode.BROWSER_ASSISTED, "https://developers.ashbyhq.com/docs/public-job-posting-api", "2026-10-06", "Public posting API; confirm no auth on first live call."),
        PlatformPolicy("linkedin", Mode.BLOCKED, Mode.DRAFT_ONLY, Mode.DRAFT_ONLY, "https://www.linkedin.com/legal/user-agreement", "2026-10-06", "User Agreement 8.2.2 / 8.2.13 prohibit bots, scrapers and automated actions."),
        PlatformPolicy("indeed", Mode.BLOCKED, Mode.DRAFT_ONLY, Mode.DRAFT_ONLY, "https://www.indeed.com/legal", "2026-10-06", "Terms prohibit automated systems incl. AI agents; public API retired."),
        PlatformPolicy("naukri", Mode.BLOCKED, Mode.DRAFT_ONLY, Mode.DRAFT_ONLY, "https://www.naukri.com/termsconditions", "2026-10-06", "No public API; terms restrict copying; secondary source - re-read before Phase 5."),
        PlatformPolicy("instahyre", Mode.BLOCKED, Mode.DRAFT_ONLY, Mode.DRAFT_ONLY, "https://www.instahyre.com/terms/", "2026-10-06", "Terms prohibit crawling/scraping; secondary source."),
        PlatformPolicy("cutshort", Mode.BLOCKED, Mode.DRAFT_ONLY, Mode.DRAFT_ONLY, "https://cutshort.io/hiring", "2026-10-06", "Official API/MCP is recruiter-side only; ask Cutshort about candidate access."),
    ]
}

# After this many days a policy row is treated as unreviewed and degrades to DRAFT_ONLY.
POLICY_MAX_AGE_DAYS = 120


def policy_for(platform: str) -> PlatformPolicy:
    return POLICIES.get(
        (platform or "").lower(),
        PlatformPolicy((platform or "unknown").lower(), Mode.BLOCKED, Mode.BLOCKED, Mode.BLOCKED, "", "", "No reviewed policy: default deny."),
    )


@dataclass(frozen=True)
class Switches:
    """Operator controls. Safe by default: nothing automated runs, and nothing is ever submitted."""

    global_automation_enabled: bool = False
    dry_run: bool = True
    disabled_platforms: frozenset = frozenset()

    @classmethod
    def from_env(cls) -> "Switches":
        def flag(name: str, default: bool) -> bool:
            raw = os.getenv(name)
            return default if raw is None else raw.strip().lower() in ("1", "true", "yes", "on")

        disabled: Set[str] = {p.strip().lower() for p in os.getenv("DISABLED_PLATFORMS", "").split(",") if p.strip()}
        return cls(flag("GLOBAL_AUTOMATION_ENABLED", False), flag("DRY_RUN", True), frozenset(disabled))

    def platform_enabled(self, platform: str) -> bool:
        return (platform or "").lower() not in self.disabled_platforms

    def may_run_unattended(self, platform: str) -> bool:
        """Scheduled/background work: needs the global switch AND the platform switch."""
        return self.global_automation_enabled and self.platform_enabled(platform)

    def may_submit(self, platform: str, policy_mode: Mode) -> bool:
        """Nothing is submitted in dry run, with automation off, or where the platform does not
        permit unattended submission. No platform currently reaches HUMAN_APPROVAL for submission."""
        return (
            not self.dry_run
            and self.global_automation_enabled
            and self.platform_enabled(platform)
            and policy_mode >= Mode.HUMAN_APPROVAL
        )


def effective_mode(policy: PlatformPolicy, action: str, today: Optional[str] = None) -> Mode:
    """The mode that applies today: the policy row's, unless its review has gone stale."""
    mode = {"search": policy.search, "profile_update": policy.profile_update, "apply": policy.apply}[action]
    if mode > Mode.DRAFT_ONLY and today and policy.reviewed_on:
        from datetime import date

        age = (date.fromisoformat(today) - date.fromisoformat(policy.reviewed_on)).days
        if age > POLICY_MAX_AGE_DAYS:
            return Mode.DRAFT_ONLY
    return mode
