import csv
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from apps.clinical.management.commands.import_regimen_drugs_source import (
    DRUG_FIELDS,
    EXPECTED_INGREDIENTS,
)
from apps.clinical.models import Drug


class ImportRegimenDrugsSourceTests(TestCase):
    def _csv_path(self, *, mutate=None):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "drugs.csv"
        rows = [
            {
                **{field: "" for field in DRUG_FIELDS},
                "drug_name": ingredient,
                "ingredient_name": ingredient,
                "efficacy_class_code": "421",
                "atc_code": f"ATC{index}",
            }
            for index, ingredient in enumerate(EXPECTED_INGREDIENTS)
        ]
        if mutate:
            mutate(rows)
        with path.open("w", encoding="utf-8", newline="") as csv_file:
            writer = csv.DictWriter(csv_file, fieldnames=DRUG_FIELDS)
            writer.writeheader()
            writer.writerows(rows)
        return path

    def test_valid_csv_dry_run_does_not_write(self):
        output = StringIO()
        before = Drug.objects.count()
        call_command(
            "import_regimen_drugs_source",
            "--dry-run",
            csv=self._csv_path(),
            stdout=output,
        )
        self.assertEqual(Drug.objects.count(), before)
        self.assertIn("신규 생성 예정 row 수: 7", output.getvalue())

    def test_duplicate_ingredient_is_rejected(self):
        def duplicate(rows):
            rows[1]["ingredient_name"] = rows[0]["ingredient_name"]

        with self.assertRaises(CommandError):
            call_command(
                "import_regimen_drugs_source",
                "--dry-run",
                csv=self._csv_path(mutate=duplicate),
            )

    def test_unexpected_ingredient_is_rejected(self):
        def replace(rows):
            rows[0]["ingredient_name"] = "Unexpected"

        with self.assertRaises(CommandError):
            call_command(
                "import_regimen_drugs_source",
                "--dry-run",
                csv=self._csv_path(mutate=replace),
            )

    def test_invalid_route_is_rejected(self):
        def invalidate(rows):
            rows[0]["route"] = "INVALID"

        with self.assertRaises(CommandError):
            call_command(
                "import_regimen_drugs_source",
                "--dry-run",
                csv=self._csv_path(mutate=invalidate),
            )

    def test_apply_creates_seven_rows(self):
        call_command("import_regimen_drugs_source", csv=self._csv_path())
        self.assertEqual(Drug.objects.count(), 7)

    def test_apply_rolls_back_on_create_error(self):
        def duplicate_atc(rows):
            rows[1]["atc_code"] = rows[0]["atc_code"]

        path = self._csv_path(mutate=duplicate_atc)
        original_create = Drug.objects.create
        calls = 0

        def failing_create(**kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("forced failure")
            return original_create(**kwargs)

        from unittest.mock import patch

        with patch.object(Drug.objects, "create", side_effect=failing_create):
            with self.assertRaises(RuntimeError):
                call_command("import_regimen_drugs_source", csv=path)
        self.assertEqual(Drug.objects.count(), 0)
