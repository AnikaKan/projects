#!/usr/bin/env python3
"""Small zero-dependency structural accessibility check for the local console."""

from __future__ import annotations

import sys
import urllib.request
from html.parser import HTMLParser
from urllib.parse import urlparse


class StructureParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.main_ids: set[str] = set()
        self.hrefs: set[str] = set()
        self.labels = 0
        self.buttons = 0
        self.status_regions = 0
        self.alert_regions = 0
        self.focusable_names: list[str] = []
        self._button_depth = 0
        self._button_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "main" and attributes.get("id"):
            self.main_ids.add(str(attributes["id"]))
        if tag == "a" and attributes.get("href"):
            self.hrefs.add(str(attributes["href"]))
        if tag == "label":
            self.labels += 1
        if tag == "button":
            self.buttons += 1
            self._button_depth += 1
            self._button_text = []
        if attributes.get("role") == "status" or attributes.get("aria-live"):
            self.status_regions += 1
        if attributes.get("role") == "alert":
            self.alert_regions += 1

    def handle_data(self, data: str) -> None:
        if self._button_depth:
            self._button_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "button" and self._button_depth:
            self.focusable_names.append(" ".join(self._button_text).strip())
            self._button_depth -= 1


def run(url: str) -> list[str]:
    if urlparse(url).scheme not in {"http", "https"}:
        return ["accessibility target must use http or https"]
    with urllib.request.urlopen(url, timeout=10) as response:  # noqa: S310
        parser = StructureParser()
        parser.feed(response.read().decode())
    failures: list[str] = []
    if "main-content" not in parser.main_ids or "#experiments" not in parser.hrefs:
        failures.append("missing skip link or main target")
    if parser.labels < 5:
        failures.append("expected labeled form controls")
    if parser.buttons == 0 or any(not name for name in parser.focusable_names):
        failures.append("every button needs an accessible name")
    if parser.status_regions == 0:
        failures.append("expected a live status region")
    return failures


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
    problems = run(target)
    if problems:
        print("\n".join(problems), file=sys.stderr)
        raise SystemExit(1)
    print("Day 6 structural accessibility checks passed for the rendered local console.")
