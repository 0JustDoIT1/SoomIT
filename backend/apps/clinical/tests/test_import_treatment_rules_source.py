import csv
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase
from django.db import IntegrityError

from apps.clinical.management.commands.import_treatment_rules_source import Command, DEFAULT_CSV, FIELDS
from apps.clinical.models import GeneFinding, Regimen, TreatmentRule
from apps.clinical.views import DoctorRegimenCandidateListAPIView


class TreatmentRuleSourceTests(SimpleTestCase):
    def setUp(self):
        self.command = Command()
        self.rows = self.command.read_rows(DEFAULT_CSV)

    def test_source_matches_real_matcher(self):
        view = DoctorRegimenCandidateListAPIView()
        for row in self.rows:
            values = {key: value for key, value in row.items() if key != "regimen_code"}
            rule = TreatmentRule(**values)
            gene, codes = next(iter(row["biomarker_condition"]["alterations"].items()))
            for code in [*codes, None, "UNSUPPORTED"]:
                data = dict(cancer_type="NSCLC", histology=None, stage_group=None,
                            pdl1_tps=None, treatment_line=None, ecog=None,
                            findings=[GeneFinding(gene_symbol=gene, alteration_code=code,
                                                  assessment="LIKELY_POSITIVE")])
                with self.subTest(rule=row["rule_code"], regimen=row["regimen_code"], code=code):
                    self.assertEqual(view._match_rule(rule, data) is not None, code in codes)

    def test_reuse_and_both_conflict_keys(self):
        values = {key: value for key, value in self.rows[0].items() if key != "regimen_code"}
        values["regimen_id"] = Regimen().pk
        original = TreatmentRule(**values)
        self.assertEqual(self.command.classify(values, []), "CREATE")
        self.assertEqual(self.command.classify(values, [original]), "REUSE")
        for changes in ({"evidence_source": "changed"}, {"priority": 2}, {"regimen_id": Regimen().pk}):
            self.assertEqual(self.command.classify({**values, **changes}, [original]), "CONFLICT")

    def test_duplicate_invalid_and_deferred_rows_rejected(self):
        with DEFAULT_CSV.open(encoding="utf-8", newline="") as stream:
            raw = list(csv.DictReader(stream))
        for change in ({"priority": "1"}, {"rule_code": "TR02"}, {"rule_code": "TR03"},
                       {"biomarker_condition": "[]"}, {"stage_condition": '{"stage":["IV"]}'}):
            with self.subTest(change=change), TemporaryDirectory() as directory:
                rows = [dict(row) for row in raw]
                rows[1].update(change)
                path = Path(directory) / "rules.csv"
                with path.open("w", encoding="utf-8", newline="") as stream:
                    writer = csv.DictWriter(stream, fieldnames=FIELDS)
                    writer.writeheader()
                    writer.writerows(rows)
                with self.assertRaises(CommandError):
                    self.command.read_rows(path)

    @patch("apps.clinical.management.commands.import_treatment_rules_source.TreatmentRule.objects")
    @patch("apps.clinical.management.commands.import_treatment_rules_source.Regimen.objects")
    def test_dry_run_and_missing_regimen(self, regimens, rules):
        regimens.filter.return_value = [Regimen(regimen_code=code, cancer_type="NSCLC")
                                       for code in ("R1", "R2", "R5", "R6")]
        rules.all.return_value = []
        output = StringIO()
        call_command("import_treatment_rules_source", dry_run=True, stdout=output)
        self.assertIn("CREATE=4 REUSE=0 CONFLICT=0", output.getvalue())
        self.assertEqual([call[0] for call in rules.mock_calls], ["all"])
        regimens.filter.return_value = []
        with self.assertRaisesMessage(CommandError, "Missing or incompatible regimen"):
            call_command("import_treatment_rules_source", dry_run=True, stdout=StringIO())

    @patch("apps.clinical.management.commands.import_treatment_rules_source.transaction.atomic")
    @patch("apps.clinical.management.commands.import_treatment_rules_source.TreatmentRule.objects")
    @patch("apps.clinical.management.commands.import_treatment_rules_source.Regimen.objects")
    def test_apply_then_reuse(self, regimens, rules, atomic):
        regimens.filter.return_value = [Regimen(regimen_code=code, cancer_type="NSCLC")
                                       for code in ("R1", "R2", "R5", "R6")]
        rules.all.return_value = []
        call_command("import_treatment_rules_source", stdout=StringIO())
        self.assertEqual(rules.create.call_count, 4)
        atomic.return_value.__enter__.assert_called_once()
        atomic.return_value.__exit__.assert_called_once_with(None, None, None)
        created = [TreatmentRule(**call.kwargs) for call in rules.create.call_args_list]
        self.assertEqual({(r.rule_code, r.priority) for r in created},
                         {("TR01", 1), ("TR01", 2), ("TR04", 1), ("TR05", 1)})
        rules.all.return_value = created
        rules.create.reset_mock()
        output = StringIO()
        call_command("import_treatment_rules_source", stdout=output)
        rules.create.assert_not_called()
        self.assertIn("CREATE=0 REUSE=4 CONFLICT=0 ERROR=0", output.getvalue())

    @patch("apps.clinical.management.commands.import_treatment_rules_source.transaction.atomic")
    @patch("apps.clinical.management.commands.import_treatment_rules_source.TreatmentRule.objects")
    @patch("apps.clinical.management.commands.import_treatment_rules_source.Regimen.objects")
    def test_conflicts_and_fk_errors_prevent_all_writes(self, regimens, rules, atomic):
        targets = [Regimen(regimen_code=code, cancer_type="NSCLC")
                   for code in ("R1", "R2", "R5", "R6")]
        regimens.filter.return_value = targets
        values = {k: v for k, v in self.rows[-1].items() if k != "regimen_code"}
        for change in ({"regimen_id": targets[-1].pk, "evidence_source": "different"},
                       {"regimen_id": Regimen().pk}):
            rules.all.return_value = [TreatmentRule(**{**values, **change})]
            with self.assertRaisesMessage(CommandError, "Conflicts detected"):
                call_command("import_treatment_rules_source", stdout=StringIO())
            rules.create.assert_not_called()
        rules.all.return_value = []
        for invalid in (targets[:-1], targets + [targets[-1]]):
            regimens.filter.return_value = invalid
            with self.assertRaisesMessage(CommandError, "expected exactly one row"):
                call_command("import_treatment_rules_source", stdout=StringIO())
            rules.create.assert_not_called()

    @patch("apps.clinical.management.commands.import_treatment_rules_source.transaction.atomic")
    @patch("apps.clinical.management.commands.import_treatment_rules_source.TreatmentRule.objects")
    @patch("apps.clinical.management.commands.import_treatment_rules_source.Regimen.objects")
    def test_mid_write_exception_exits_atomic_for_rollback(self, regimens, rules, atomic):
        regimens.filter.return_value = [Regimen(regimen_code=code, cancer_type="NSCLC")
                                       for code in ("R1", "R2", "R5", "R6")]
        rules.all.return_value = []
        failure = IntegrityError("simulated concurrent conflict")
        rules.create.side_effect = [TreatmentRule(), failure]
        atomic.return_value.__exit__.return_value = False
        with self.assertRaises(IntegrityError):
            call_command("import_treatment_rules_source", stdout=StringIO())
        self.assertEqual(rules.create.call_count, 2)
        atomic.return_value.__exit__.assert_called_once()
        self.assertIs(atomic.return_value.__exit__.call_args.args[0], IntegrityError)
        self.assertIs(atomic.return_value.__exit__.call_args.args[1], failure)
