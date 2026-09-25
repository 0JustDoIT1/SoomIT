"""Validate and atomically import the five document-approved treatment rules."""
import csv
import json
from collections import Counter
from contextlib import nullcontext
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.clinical.models import Regimen, TreatmentRule


DEFAULT_CSV = Path(__file__).resolve().parents[2] / "data" / "treatment_rules_source.csv"
FIELDS = (
    "rule_code", "cancer_type", "histology", "stage_condition",
    "biomarker_condition", "pdl1_condition", "ecog_condition",
    "treatment_line", "regimen_code", "priority", "evidence_source",
)
EXPECTED = {
    ("TR01", "R1"): 1,
    ("TR01", "R2"): 2,
    ("TR02", "R3"): 1,
    ("TR03", "R4"): 1,
    ("TR04", "R5"): 1,
    ("TR05", "R6"): 1,
}
ALTERATIONS = {
    "TR01": {"alterations": {"EGFR": ["EGFR_EX19_DEL", "EGFR_L858R"]}},
    "TR04": {"alterations": {"BRAF": ["BRAF_V600E"]}},
    "TR05": {"alterations": {"MET": ["MET_EXON14_SKIPPING"]}},
}
RULE_CONDITIONS = {
    "TR01": {
        "histology": None,
        "stage_condition": None,
        "biomarker_condition": ALTERATIONS["TR01"],
        "pdl1_condition": None,
        "ecog_condition": None,
        "treatment_line": None,
    },
    "TR02": {
        "histology": None,
        "stage_condition": {"stage": ["IV"]},
        "biomarker_condition": None,
        "pdl1_condition": {"min": 50},
        "ecog_condition": None,
        "treatment_line": "1L",
    },
    "TR03": {
        "histology": "non-squamous",
        "stage_condition": None,
        "biomarker_condition": None,
        "pdl1_condition": None,
        "ecog_condition": None,
        "treatment_line": None,
    },
    "TR04": {
        "histology": None,
        "stage_condition": None,
        "biomarker_condition": ALTERATIONS["TR04"],
        "pdl1_condition": None,
        "ecog_condition": None,
        "treatment_line": None,
    },
    "TR05": {
        "histology": None,
        "stage_condition": None,
        "biomarker_condition": ALTERATIONS["TR05"],
        "pdl1_condition": None,
        "ecog_condition": None,
        "treatment_line": None,
    },
}


class Command(BaseCommand):
    help = "Import prototype TR01-TR05 CSV; use --dry-run to validate without writes."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)

    def read_rows(self, path):
        try:
            with path.open(encoding="utf-8-sig", newline="") as stream:
                reader = csv.DictReader(stream)
                if reader.fieldnames != list(FIELDS):
                    raise CommandError("CSV headers must exactly match the treatment-rule contract.")
                rows = list(reader)
        except (OSError, UnicodeError, csv.Error) as exc:
            raise CommandError(f"Cannot read CSV: {exc}") from exc
        keys, priorities = set(), set()
        for line, row in enumerate(rows, 2):
            if None in row or any(value is None for value in row.values()):
                raise CommandError(f"Line {line}: invalid column count.")
            row.update({key: value.strip() or None for key, value in row.items()})
            try:
                row["priority"] = int(row["priority"])
                for field in ("stage_condition", "biomarker_condition", "pdl1_condition", "ecog_condition"):
                    row[field] = json.loads(row[field]) if row[field] else None
            except (TypeError, ValueError) as exc:
                raise CommandError(f"Line {line}: invalid priority or JSON.") from exc
            key = (row["rule_code"], row["regimen_code"])
            slot = (row["rule_code"], row["priority"])
            if key in keys or slot in priorities:
                raise CommandError(f"Line {line}: duplicate rule/regimen or rule/priority.")
            keys.add(key)
            priorities.add(slot)
            if key not in EXPECTED or row["priority"] != EXPECTED[key]:
                raise CommandError(f"Line {line}: outside the four-row prototype scope.")
            expected_conditions = RULE_CONDITIONS.get(row["rule_code"])
            actual_conditions = {
                field: row[field]
                for field in (
                    "histology",
                    "stage_condition",
                    "biomarker_condition",
                    "pdl1_condition",
                    "ecog_condition",
                    "treatment_line",
                )
            }
            if (row["cancer_type"] != "NSCLC"
                    or expected_conditions is None
                    or actual_conditions != expected_conditions
                    or not row["evidence_source"]):
                raise CommandError(f"Line {line}: conditions/evidence differ from the prototype contract.")
        if keys != set(EXPECTED):
            raise CommandError(
                "CSV must contain exactly TR01/R1, TR01/R2, TR02/R3, "
                "TR03/R4, TR04/R5, and TR05/R6."
            )
        return rows

    @staticmethod
    def classify(values, existing):
        same_key = [item for item in existing if item.rule_code == values["rule_code"]
                    and item.regimen_id == values["regimen_id"]]
        same_slot = [item for item in existing if item.rule_code == values["rule_code"]
                     and item.priority == values["priority"]]
        if same_key:
            if len(same_key) != 1 or any(item.pk != same_key[0].pk for item in same_slot):
                return "CONFLICT"
            return "REUSE" if all(getattr(same_key[0], key) == value
                                  for key, value in values.items()) else "CONFLICT"
        return "CONFLICT" if same_slot else "CREATE"

    def handle(self, *args, **options):
        rows = self.read_rows(options["csv"])
        with nullcontext() if options["dry_run"] else transaction.atomic():
            decisions = self.plan(rows)
            if not options["dry_run"]:
                for status, values in decisions:
                    if status == "CREATE":
                        TreatmentRule.objects.create(**values)
        if options["dry_run"]:
            self.stdout.write("Dry-run complete: database unchanged. CREATE means planned only.")
        else:
            self.stdout.write("Import complete: transaction committed; existing rows unchanged.")

    def plan(self, rows):
        regimen_rows = list(Regimen.objects.filter(
            regimen_code__in=[row["regimen_code"] for row in rows]))
        counts = Counter(item.regimen_code for item in regimen_rows)
        regimens = {item.regimen_code: item for item in regimen_rows}
        existing = list(TreatmentRule.objects.all())
        self.stdout.write(f"Existing treatment_rules: {len(existing)}")
        statuses = Counter()
        decisions = []
        for row in rows:
            code = row["regimen_code"]
            regimen = regimens.get(code)
            if counts[code] != 1 or regimen.cancer_type != row["cancer_type"]:
                raise CommandError(f"Missing or incompatible regimen: {code}; expected exactly one row.")
            values = {key: value for key, value in row.items() if key != "regimen_code"}
            values["regimen_id"] = regimen.pk
            try:
                TreatmentRule(**values).full_clean(
                    exclude=["regimen"], validate_unique=False, validate_constraints=False)
            except ValidationError as exc:
                raise CommandError(f"Invalid model values for {row['rule_code']}/{code}: {exc}") from exc
            status = self.classify(values, existing)
            statuses[status] += 1
            decisions.append((status, values))
            self.stdout.write(f"{row['rule_code']}/{code}/priority={row['priority']}: {status}")
        self.stdout.write(" ".join(f"{name}={statuses[name]}" for name in ("CREATE", "REUSE", "CONFLICT", "ERROR")))
        if statuses["CONFLICT"]:
            raise CommandError("Conflicts detected; no automatic updates and no writes.")
        return decisions
