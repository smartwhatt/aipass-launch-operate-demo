"""Check the specification assets without claiming application readiness."""

import hashlib
import json
import math
import re
from datetime import datetime
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    required = [
        "AGENTS.md", "IMPLEMENTATION_SPEC.md", "README.md", "README.th.md",
        ".env.example", "docs/VIDEO_DEMO_MATRIX.md", "docs/RECORDING_RUNBOOK.md",
        "docs/DISTRIBUTION.md", "docs/AIPASS_PROMPTS.md",
        "docs/IMPLEMENTATION_REPORT.template.md",
    ]
    for path in required:
        require((ROOT / path).is_file(), f"Missing file: {path}")

    manifest = read("docs/sources/manifest.json")
    require(len(manifest["sources"]) == 4, "Expected three scripts and one legacy guide")
    counts = {"ep1": 13, "ep2": 13, "ep3": 14}
    for source in manifest["sources"]:
        path = ROOT / source["path"]
        require(path.is_file(), f"Missing snapshot: {path}")
        require(hashlib.sha256(path.read_bytes()).hexdigest() == source["sha256"], "Source snapshot changed without updating provenance")
        if source["key"] in counts:
            text = path.read_text(encoding="utf-8")
            slots = re.findall(r"(?m)^(\d+)\n \| (\d\d:\d\d)[–-](\d\d:\d\d)\n", text)
            require(len(slots) == counts[source["key"]], "Unexpected script slot count")
            end = 0
            for number, start, finish in slots:
                to_seconds = lambda s: int(s[:2]) * 60 + int(s[3:])
                require(to_seconds(start) == end, f"Timing gap at {source['key']} slot {number}")
                end = to_seconds(finish)
            require(end == 600, "Each script must end at 10:00")

    matrix = (ROOT / "docs/VIDEO_DEMO_MATRIX.md").read_text(encoding="utf-8")
    require(len(re.findall(r"(?m)^\| \d+ /", matrix)) == 40, "Expected 40 video mappings")

    documents = [read(f"fixtures/documents/docs-v{n}.json") for n in (1, 2)]
    for doc in documents:
        require(doc["fictional"] is True, "Handbook must be fictional")
        require({s["id"] for s in doc["sections"]} == {"2.1", "3.1", "3.2", "4.1", "4.2"}, "Handbook sections differ")
    require("09:00–16:00" in documents[0]["sections"][0]["text"], "Wrong v1 hours")
    require("08:30–16:30" in documents[1]["sections"][0]["text"], "Wrong v2 hours")

    evaluation = read("fixtures/evaluation-cases.json")
    require([c["id"] for c in evaluation["cases"]] == [f"Q{i:02d}" for i in range(1, 11)], "Evaluation IDs differ")
    require({c["id"] for c in evaluation["cases"] if c["critical"]} == set(evaluation["critical_ids"]), "Critical cases differ")
    require(evaluation["critical_ids"] == ["Q01", "Q02", "Q03", "Q05", "Q06"], "Critical gate differs")
    require(evaluation["minimum_total_pass"] == 9, "Evaluation threshold differs")

    costs = read("fixtures/cost-cases.json")
    shared = {k: Decimal(str(v)) for k, v in costs["shared"].items()}
    per_call = (shared["input_tokens"] * shared["input_usd_per_million"] + shared["output_tokens"] * shared["output_usd_per_million"]) / 1_000_000 * shared["thb_per_usd"]
    require(per_call == Decimal("0.14"), "Wrong per-call teaching cost")
    fixed = shared["hosting_thb_month"] + shared["domain_thb_year"] / 12 + shared["other_fixed_thb_month"]
    for case in costs["cases"]:
        questions = Decimal(case["users"]) * shared["questions_per_user_day"] * shared["days_per_month"]
        calls = questions * Decimal(str(case["calls_per_question"]))
        model_cost = calls * per_call
        total = model_cost + fixed + questions * shared["other_variable_thb_question"]
        require(questions == case["questions"], "Wrong question count")
        require(calls == case["model_calls"], "Wrong model-call count")
        require(model_cost == case["model_cost_thb"], "Wrong model subtotal")
        require(total == case["total_thb"], "Wrong monthly total")

    layout = read("fixtures/calculator-layout.json")
    require(layout["sheets"] == ["Start", "Inputs", "Scenarios", "Checks"], "Workbook sheet names differ")
    require(len(layout["baseline_formulas"]) == 10, "Workbook formulas missing")
    require(layout["baseline_formulas"]["B16"] == "=IF(B7=0,0,B15/B7)", "Zero-question guard differs")

    contract = read("fixtures/dashboard-contract.json")
    requests = read("fixtures/pilot-requests.json")
    feedback = read("fixtures/pilot-feedback.json")
    ids = {r["id"] for r in requests}
    require(len(ids) == len(requests) == contract["requests"] == 200, "Request fixture count differs")
    require(len({r["user_id"] for r in requests}) == 20, "Expected 20 pilot users")
    days = {datetime.fromisoformat(r["created_at"]).date() for r in requests}
    require(len(days) == 5 and all(day.weekday() < 5 for day in days), "Expected five working days")
    errors = sum(r["status"] == "provider_unavailable" for r in requests)
    require(errors == contract["errors"] == 6, "Wrong error fixture count")
    require(len(requests) - errors == contract["success"] == 194, "Wrong success count")
    require(sum(r["status"] == "insufficient_info" for r in requests) == 40, "Wrong insufficient-info count")
    p95 = sorted(r["latency_ms"] for r in requests)[math.ceil(0.95 * len(requests)) - 1]
    require(p95 == contract["p95_ms"] == 9000, "Wrong p95 fixture")
    calls = sum(r["model_calls"] for r in requests)
    require(calls == contract["model_calls"] == 206, "Wrong call fixture count")
    require(calls * per_call == Decimal(contract["estimated_cost_thb"]), "Wrong dashboard cost")
    require(len(feedback) == contract["feedback"] == 24, "Wrong feedback count")
    require(sum(f["label"] == "needs_correction" for f in feedback) == 8, "Wrong correction count")
    require(all(f["request_id"] in ids for f in feedback), "Feedback references missing request")
    trace = next(r for r in requests if r["id"] == "DEMO-R042")
    require(trace["status"] == "ok" and trace["document_version"] == "docs-v1", "Historical trace differs")
    require("09:00–16:00" in trace["answer"], "Historical answer differs")

    scenarios = read("fixtures/scenarios.json")
    scenario_ids = {s["id"] for s in scenarios["scenarios"]}
    require(len(scenario_ids) == len(scenarios["scenarios"]) == 9, "Expected nine reset scenarios")
    require(scenarios["common"]["daily_quota"] == 20, "Quota differs")
    require(scenarios["common"]["rate_per_60_seconds"] == 5, "Rate limit differs")

    print("PASS: source hashes, 40 video slots, 10 evaluation cases, nine scenarios, and teaching data")
    print("PASS: calculator targets 1890 / 15750 / 2044 THB, dashboard 200 requests / p95 9000 ms / 28.84 THB")
    print("Scope: handoff assets only. Application, live provider, deployment, and Excel execution remain untested.")


if __name__ == "__main__":
    main()
