"""Result tracking and CI-summary rendering for the marketplace quality gate.

Extracted from scripts/validate-marketplace.py (see issue #670).
"""
import json

# Prefix for the machine-readable CI summary line (see Results.summary_line()).
# Grep this marker in CI logs to get a structured pass/fail count without
# parsing the free-text ERROR/WARN/OK lines or invoking --json mode.
SUMMARY_PREFIX = "MARKETPLACE_QUALITY_SUMMARY:"


class Results:
    def __init__(self):
        self.errors = []
        self.warnings = []
        self.info = []
        self.passes = []
        # Bounded set of named section timings (e.g. "static", "cross-repo",
        # "nightly"). Section names are fixed constants defined in main(),
        # never derived from file paths or user input, so this list stays
        # small regardless of registry size.
        self.timings = []

    def error(self, category, msg):
        self.errors.append((category, msg))

    def warn(self, category, msg):
        self.warnings.append((category, msg))

    def note(self, category, msg):
        self.info.append((category, msg))

    def ok(self, category, msg):
        self.passes.append((category, msg))

    def record_timing(self, section, seconds):
        self.timings.append((section, seconds))

    @property
    def total_duration(self):
        return sum(seconds for _, seconds in self.timings)

    @property
    def exit_code(self):
        if self.errors:
            return 1
        if self.warnings:
            return 2
        return 0

    def summary_md(self):
        lines = []
        total = len(self.errors) + len(self.warnings) + len(self.passes)
        lines.append(f"### Marketplace Quality: {len(self.errors)} error(s), "
                     f"{len(self.warnings)} warning(s), {len(self.passes)} passed")
        lines.append("")
        if self.errors:
            lines.append("#### Errors")
            for cat, msg in self.errors:
                lines.append(f"- **[{cat}]** {msg}")
            lines.append("")
        if self.warnings:
            lines.append("#### Warnings")
            for cat, msg in self.warnings:
                lines.append(f"- **[{cat}]** {msg}")
            lines.append("")
        if self.info:
            lines.append("#### Info")
            for cat, msg in self.info:
                lines.append(f"- **[{cat}]** {msg}")
            lines.append("")
        if self.timings:
            lines.append("#### Timing")
            for section, seconds in self.timings:
                lines.append(f"- `{section}`: {seconds:.2f}s")
            lines.append(f"- **total**: {self.total_duration:.2f}s")
            lines.append("")
        return "\n".join(lines)

    def print_summary(self):
        for cat, msg in self.errors:
            print(f"  ERROR [{cat}] {msg}")
        for cat, msg in self.warnings:
            print(f"  WARN  [{cat}] {msg}")
        for cat, msg in self.info:
            print(f"  INFO  [{cat}] {msg}")
        for cat, msg in self.passes:
            print(f"  OK    [{cat}] {msg}")
        print()
        print(f"Result: {len(self.errors)} error(s), {len(self.warnings)} warning(s), "
              f"{len(self.passes)} passed")
        if self.timings:
            timing_str = ", ".join(f"{s}={t:.2f}s" for s, t in self.timings)
            print(f"Timing: {timing_str}, total={self.total_duration:.2f}s")
        # Single-line, grep-friendly JSON record for CI-log tooling. Only
        # bounded counts/status go here (never raw error/warning messages,
        # which are free-text and unbounded) so this stays a fixed-size
        # record regardless of registry size or failure volume.
        summary_record = {
            "error_count": len(self.errors),
            "warning_count": len(self.warnings),
            "info_count": len(self.info),
            "pass_count": len(self.passes),
            "total_duration_seconds": round(self.total_duration, 3),
            "exit_code": self.exit_code,
        }
        print(f"MARKETPLACE_QUALITY_SUMMARY: {json.dumps(summary_record)}")

    def to_json(self):
        return {
            "errors": [{"category": c, "message": m} for c, m in self.errors],
            "warnings": [{"category": c, "message": m} for c, m in self.warnings],
            "info": [{"category": c, "message": m} for c, m in self.info],
            "passes": [{"category": c, "message": m} for c, m in self.passes],
            "timings": [{"section": s, "seconds": round(t, 3)} for s, t in self.timings],
            "total_duration_seconds": round(self.total_duration, 3),
            "exit_code": self.exit_code,
        }

    def summary_line(self, mode):
        """Return a single-line, bounded, machine-readable summary for CI-log
        observability. Fields are fixed counts/enums only (no free-text
        messages), so the line stays grep-able and constant-size regardless
        of registry size. Stdout-only — no exporter, no external data flow.
        """
        summary = {
            "mode": mode,
            "error_count": len(self.errors),
            "warning_count": len(self.warnings),
            "info_count": len(self.info),
            "pass_count": len(self.passes),
            "total_duration_seconds": round(self.total_duration, 3),
            "exit_code": self.exit_code,
        }
        return f"{SUMMARY_PREFIX} {json.dumps(summary, sort_keys=True)}"
