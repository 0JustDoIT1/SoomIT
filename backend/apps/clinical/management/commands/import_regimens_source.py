import csv
from collections import Counter
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.clinical.models import (
    DoseBasis,
    Drug,
    DrugRoute,
    Regimen,
    RegimenDrug,
    TreatmentPhase,
)


EXPECTED_REGIMEN_CODES = ("R1", "R2", "R3", "R4", "R5", "R6")
EXPECTED_INGREDIENTS = (
    "Osimertinib",
    "Pemetrexed",
    "Carboplatin",
    "Pembrolizumab",
    "Dabrafenib",
    "Trametinib",
    "Capmatinib",
)
REGIMEN_FIELDS = (
    "regimen_code",
    "regimen_name",
    "cancer_type",
    "histology",
    "treatment_line",
    "cycle_length_days",
    "induction_cycles",
    "maintenance_yn",
    "source",
    "source_version",
)
REGIMEN_DRUG_FIELDS = (
    "regimen_code",
    "ingredient_name",
    "dose",
    "dose_unit",
    "result_unit",
    "dose_basis",
    "route",
    "administration_day",
    "frequency",
    "sequence",
    "phase",
)
REGIMEN_MODEL_FIELDS = REGIMEN_FIELDS
REGIMEN_DRUG_MODEL_FIELDS = (
    "dose",
    "dose_unit",
    "result_unit",
    "dose_basis",
    "route",
    "administration_day",
    "frequency",
    "sequence",
    "phase",
)
EXPECTED_REGIMEN_DRUG_COUNTS = {
    "R1": 1,
    "R2": 5,
    "R3": 1,
    "R4": 5,
    "R5": 2,
    "R6": 1,
}
EXPECTED_PHASE_COUNTS = {
    ("R1", "CONTINUOUS"): 1,
    ("R2", "INDUCTION"): 3,
    ("R2", "MAINTENANCE"): 2,
    ("R3", "CONTINUOUS"): 1,
    ("R4", "INDUCTION"): 3,
    ("R4", "MAINTENANCE"): 2,
    ("R5", "CONTINUOUS"): 2,
    ("R6", "CONTINUOUS"): 1,
}
DATA_DIR = Path(__file__).resolve().parents[2] / "data"
DEFAULT_REGIMENS_CSV = DATA_DIR / "regimens_source.csv"
DEFAULT_REGIMEN_DRUGS_CSV = DATA_DIR / "regimen_drugs_schedule_source.csv"


class Command(BaseCommand):
    help = "Import the validated R1-R6 regimens and their regimen-drug schedules."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--regimens-csv", type=Path, default=DEFAULT_REGIMENS_CSV)
        parser.add_argument(
            "--regimen-drugs-csv",
            type=Path,
            default=DEFAULT_REGIMEN_DRUGS_CSV,
        )

    def handle(self, *args, **options):
        regimen_rows, regimen_errors = self._read_regimens(options["regimens_csv"])
        regimen_drug_rows, regimen_drug_errors = self._read_regimen_drugs(
            options["regimen_drugs_csv"]
        )
        drug_map, drug_errors = self._resolve_drugs(regimen_drug_rows)
        errors = regimen_errors + regimen_drug_errors + drug_errors

        regimen_decisions = self._classify_regimens(regimen_rows) if not errors else []
        regimen_drug_decisions = (
            self._classify_regimen_drugs(regimen_drug_rows, regimen_decisions, drug_map)
            if not errors
            else []
        )

        self._print_summary("Regimen", len(regimen_rows), regimen_decisions, errors)
        self._print_summary(
            "RegimenDrug",
            len(regimen_drug_rows),
            regimen_drug_decisions,
            errors,
        )
        for decision in regimen_decisions:
            self.stdout.write(f"{decision['row']['regimen_code']}: {decision['status']}")
        for code in EXPECTED_REGIMEN_CODES:
            statuses = [
                item["status"]
                for item in regimen_drug_decisions
                if item["row"]["regimen_code"] == code
            ]
            self.stdout.write(f"{code} RegimenDrug: {', '.join(statuses) or 'ERROR'}")
        for error in errors:
            self.stderr.write(error)

        conflicts = sum(
            decision["status"] == "CONFLICT"
            for decision in regimen_decisions + regimen_drug_decisions
        )
        if errors or conflicts:
            raise CommandError("Validation error or conflict detected; nothing was written.")

        if options["dry_run"]:
            self.stdout.write(self.style.SUCCESS("Dry-run complete: database unchanged."))
            return

        with transaction.atomic():
            regimen_map = {}
            for decision in regimen_decisions:
                row = decision["row"]
                if decision["status"] == "CREATE":
                    regimen = Regimen.objects.create(**row)
                else:
                    regimen = decision["object"]
                regimen_map[row["regimen_code"]] = regimen

            for decision in regimen_drug_decisions:
                if decision["status"] != "CREATE":
                    continue
                row = decision["row"]
                RegimenDrug.objects.create(
                    regimen=regimen_map[row["regimen_code"]],
                    drug=drug_map[row["ingredient_name"]],
                    **{field: row[field] for field in REGIMEN_DRUG_MODEL_FIELDS},
                )

        self.stdout.write(self.style.SUCCESS("Import complete."))

    def _read_csv(self, path, required_fields):
        if not path.is_file():
            raise CommandError(f"CSV file not found: {path}")
        with path.open(encoding="utf-8-sig", newline="") as csv_file:
            reader = csv.DictReader(csv_file)
            missing = [field for field in required_fields if field not in (reader.fieldnames or [])]
            if missing:
                raise CommandError("Missing CSV headers: " + ", ".join(missing))
            return [
                {field: (source.get(field) or "").strip() for field in required_fields}
                for source in reader
            ]

    def _read_regimens(self, path):
        rows = self._read_csv(path, REGIMEN_FIELDS)
        errors = []
        codes = [row["regimen_code"] for row in rows]
        if len(rows) != 6:
            errors.append(f"Regimen CSV must contain exactly 6 rows; found {len(rows)}.")
        if Counter(codes) != Counter(EXPECTED_REGIMEN_CODES):
            errors.append("Regimen CSV must contain each of R1-R6 exactly once.")

        for line, row in enumerate(rows, start=2):
            for field in ("regimen_code", "regimen_name", "cancer_type"):
                if not row[field]:
                    errors.append(f"Regimen line {line}: {field} is required.")
            for field in ("cycle_length_days", "induction_cycles"):
                value = row[field]
                if value:
                    try:
                        parsed = int(value)
                    except ValueError:
                        errors.append(f"Regimen line {line}: {field} must be an integer.")
                        parsed = None
                    minimum = 1 if field == "cycle_length_days" else 0
                    if parsed is not None and parsed < minimum:
                        errors.append(f"Regimen line {line}: {field} must be >= {minimum}.")
                    row[field] = parsed
                else:
                    row[field] = None
            if row["maintenance_yn"].casefold() not in {"true", "false"}:
                errors.append(f"Regimen line {line}: maintenance_yn must be True or False.")
            row["maintenance_yn"] = row["maintenance_yn"].casefold() == "true"
            for field in ("histology", "treatment_line", "source", "source_version"):
                row[field] = row[field] or None

        by_code = {row["regimen_code"]: row for row in rows}
        for code in ("R1", "R5", "R6"):
            if code in by_code and by_code[code]["cycle_length_days"] is not None:
                errors.append(f"{code}: cycle_length_days must be empty.")
        if "R3" in by_code and by_code["R3"]["cycle_length_days"] != 21:
            errors.append("R3: cycle_length_days must be 21.")
        return rows, errors

    def _read_regimen_drugs(self, path):
        rows = self._read_csv(path, REGIMEN_DRUG_FIELDS)
        errors = []
        allowed_dose_basis = {value for value, _label in DoseBasis.choices}
        allowed_routes = {value for value, _label in DrugRoute.choices}
        allowed_phases = {value for value, _label in TreatmentPhase.choices}
        unique_keys = set()

        if len(rows) != 15:
            errors.append(f"RegimenDrug CSV must contain exactly 15 rows; found {len(rows)}.")
        for line, row in enumerate(rows, start=2):
            if row["regimen_code"] not in EXPECTED_REGIMEN_CODES:
                errors.append(f"RegimenDrug line {line}: invalid regimen_code.")
            if row["ingredient_name"] not in EXPECTED_INGREDIENTS:
                errors.append(f"RegimenDrug line {line}: invalid ingredient_name.")
            for field in ("dose_unit", "result_unit", "administration_day"):
                if not row[field]:
                    errors.append(f"RegimenDrug line {line}: {field} is required.")
            try:
                row["dose"] = Decimal(row["dose"])
                if row["dose"] < 0:
                    errors.append(f"RegimenDrug line {line}: dose must be >= 0.")
            except InvalidOperation:
                errors.append(f"RegimenDrug line {line}: dose must be a decimal.")
            try:
                row["sequence"] = int(row["sequence"])
                if row["sequence"] < 1:
                    errors.append(f"RegimenDrug line {line}: sequence must be >= 1.")
            except ValueError:
                errors.append(f"RegimenDrug line {line}: sequence must be an integer.")
            if row["dose_basis"] not in allowed_dose_basis:
                errors.append(f"RegimenDrug line {line}: invalid dose_basis.")
            if row["route"] not in allowed_routes:
                errors.append(f"RegimenDrug line {line}: invalid route.")
            if row["phase"] not in allowed_phases:
                errors.append(f"RegimenDrug line {line}: invalid phase.")
            row["frequency"] = row["frequency"] or None
            key = (
                row["regimen_code"],
                row["ingredient_name"],
                row["phase"],
                row["administration_day"],
                row["sequence"],
            )
            if key in unique_keys:
                errors.append(f"RegimenDrug line {line}: duplicate schedule key.")
            unique_keys.add(key)

        regimen_counts = Counter(row["regimen_code"] for row in rows)
        if regimen_counts != Counter(EXPECTED_REGIMEN_DRUG_COUNTS):
            errors.append("RegimenDrug counts per regimen do not match the approved schedule.")
        phase_counts = Counter((row["regimen_code"], row["phase"]) for row in rows)
        if phase_counts != Counter(EXPECTED_PHASE_COUNTS):
            errors.append("RegimenDrug phase counts do not match the approved schedule.")
        carboplatin_rows = [row for row in rows if row["ingredient_name"] == "Carboplatin"]
        if len(carboplatin_rows) != 2 or any(
            row["regimen_code"] not in {"R2", "R4"}
            or row["dose"] != Decimal("5")
            or row["dose_basis"] != "AUC"
            or row["dose_unit"] != "AUC"
            or row["result_unit"] != "mg"
            for row in carboplatin_rows
        ):
            errors.append("R2/R4 Carboplatin AUC values do not match the approved schedule.")
        return rows, errors

    def _resolve_drugs(self, rows):
        errors = []
        drug_map = {}
        for ingredient in sorted({row["ingredient_name"] for row in rows}):
            matches = list(Drug.objects.filter(ingredient_name=ingredient)[:2])
            if len(matches) != 1:
                errors.append(
                    f"Drug ingredient_name={ingredient!r} must match exactly one row; "
                    f"found {len(matches)}."
                )
            else:
                drug_map[ingredient] = matches[0]
        return drug_map, errors

    def _classify_regimens(self, rows):
        decisions = []
        for row in rows:
            existing = Regimen.objects.filter(regimen_code=row["regimen_code"]).first()
            if existing is None:
                status = "CREATE"
            elif all(getattr(existing, field) == row[field] for field in REGIMEN_MODEL_FIELDS):
                status = "REUSE"
            else:
                status = "CONFLICT"
            decisions.append({"row": row, "status": status, "object": existing})
        return decisions

    def _classify_regimen_drugs(self, rows, regimen_decisions, drug_map):
        regimen_map = {
            item["row"]["regimen_code"]: item["object"] for item in regimen_decisions
        }
        decisions = []
        for row in rows:
            regimen = regimen_map[row["regimen_code"]]
            if regimen is None:
                decisions.append({"row": row, "status": "CREATE", "object": None})
                continue
            existing = RegimenDrug.objects.filter(
                regimen=regimen,
                drug=drug_map[row["ingredient_name"]],
                phase=row["phase"],
                administration_day=row["administration_day"],
                sequence=row["sequence"],
            ).first()
            if existing is None:
                status = "CREATE"
            elif all(
                getattr(existing, field) == row[field]
                for field in REGIMEN_DRUG_MODEL_FIELDS
            ):
                status = "REUSE"
            else:
                status = "CONFLICT"
            decisions.append({"row": row, "status": status, "object": existing})
        return decisions

    def _print_summary(self, label, row_count, decisions, errors):
        self.stdout.write(f"{label} CSV rows: {row_count}")
        for status in ("CREATE", "REUSE", "CONFLICT"):
            count = sum(item["status"] == status for item in decisions)
            self.stdout.write(f"{label} {status}: {count}")
        self.stdout.write(f"{label} ERROR: {len(errors)}")
