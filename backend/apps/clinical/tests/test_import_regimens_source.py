import csv
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from apps.clinical.management.commands.import_regimens_source import (
    DEFAULT_REGIMEN_DRUGS_CSV,
    DEFAULT_REGIMENS_CSV,
    REGIMEN_DRUG_FIELDS,
    REGIMEN_FIELDS,
)
from apps.clinical.models import Drug, Regimen, RegimenDrug


class ImportRegimensSourceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        ingredients = {
            row["ingredient_name"]
            for row in cls._read_rows(DEFAULT_REGIMEN_DRUGS_CSV)
        }
        for ingredient in ingredients:
            Drug.objects.create(drug_name=ingredient, ingredient_name=ingredient)

    @staticmethod
    def _read_rows(path):
        with path.open(encoding="utf-8-sig", newline="") as csv_file:
            return list(csv.DictReader(csv_file))

    def _copy_csvs(self, *, mutate_regimens=None, mutate_regimen_drugs=None):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        regimen_rows = self._read_rows(DEFAULT_REGIMENS_CSV)
        regimen_drug_rows = self._read_rows(DEFAULT_REGIMEN_DRUGS_CSV)
        if mutate_regimens:
            mutate_regimens(regimen_rows)
        if mutate_regimen_drugs:
            mutate_regimen_drugs(regimen_drug_rows)
        regimen_path = root / "regimens.csv"
        regimen_drug_path = root / "regimen_drugs.csv"
        for path, fields, rows in (
            (regimen_path, REGIMEN_FIELDS, regimen_rows),
            (regimen_drug_path, REGIMEN_DRUG_FIELDS, regimen_drug_rows),
        ):
            with path.open("w", encoding="utf-8", newline="") as csv_file:
                writer = csv.DictWriter(csv_file, fieldnames=fields)
                writer.writeheader()
                writer.writerows(rows)
        return regimen_path, regimen_drug_path

    def _call(self, *extra, **kwargs):
        regimen_path, regimen_drug_path = self._copy_csvs(**kwargs)
        return call_command(
            "import_regimens_source",
            *extra,
            regimens_csv=regimen_path,
            regimen_drugs_csv=regimen_drug_path,
        )

    def test_valid_dry_run_does_not_write(self):
        output = StringIO()
        self._call("--dry-run", stdout=output)
        self.assertEqual(Regimen.objects.count(), 0)
        self.assertEqual(RegimenDrug.objects.count(), 0)
        self.assertIn("Regimen CREATE: 6", output.getvalue())
        self.assertIn("RegimenDrug CREATE: 15", output.getvalue())

    def test_invalid_regimen_code_is_rejected(self):
        with self.assertRaises(CommandError):
            self._call(
                "--dry-run",
                mutate_regimens=lambda rows: rows[0].update(regimen_code="R7"),
            )

    def test_missing_drug_is_rejected(self):
        Drug.objects.filter(ingredient_name="Capmatinib").delete()
        with self.assertRaises(CommandError):
            self._call("--dry-run")

    def test_invalid_phase_is_rejected(self):
        with self.assertRaises(CommandError):
            self._call(
                "--dry-run",
                mutate_regimen_drugs=lambda rows: rows[0].update(phase="INVALID"),
            )

    def test_existing_schedule_with_different_values_is_conflict(self):
        self._call()
        RegimenDrug.objects.filter(regimen__regimen_code="R1").update(dose=81)
        with self.assertRaises(CommandError):
            self._call("--dry-run")

    def test_apply_creates_six_regimens_and_fifteen_schedules(self):
        self._call()
        self.assertEqual(Regimen.objects.count(), 6)
        self.assertEqual(RegimenDrug.objects.count(), 15)

    def test_apply_rolls_back_on_create_error(self):
        original_create = RegimenDrug.objects.create
        calls = 0

        def failing_create(**kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("forced failure")
            return original_create(**kwargs)

        with patch.object(RegimenDrug.objects, "create", side_effect=failing_create):
            with self.assertRaises(RuntimeError):
                self._call()
        self.assertEqual(Regimen.objects.count(), 0)
        self.assertEqual(RegimenDrug.objects.count(), 0)
