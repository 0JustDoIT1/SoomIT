import csv
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from apps.clinical.models import Drug, DrugRoute


EXPECTED_INGREDIENTS = (
    "Osimertinib",
    "Pemetrexed",
    "Carboplatin",
    "Pembrolizumab",
    "Dabrafenib",
    "Trametinib",
    "Capmatinib",
)
DRUG_FIELDS = (
    "drug_name",
    "ingredient_name",
    "hira_ingredient_code",
    "product_code",
    "standard_code",
    "mfds_item_seq",
    "dur_ingredient_code",
    "strength",
    "strength_unit",
    "dosage_form",
    "route",
    "efficacy_class_code",
    "atc_code",
)
NULLABLE_FIELDS = set(DRUG_FIELDS) - {
    "drug_name",
    "ingredient_name",
    "efficacy_class_code",
    "atc_code",
}
DEFAULT_CSV_PATH = Path(__file__).resolve().parents[2] / "data" / "regimen_drugs_source.csv"


class Command(BaseCommand):
    help = "Import the seven canonical regimen drugs from the validated source CSV."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--csv", type=Path, default=DEFAULT_CSV_PATH)

    def handle(self, *args, **options):
        csv_path = options["csv"]
        dry_run = options["dry_run"]
        rows, validation_errors = self._read_and_validate(csv_path)
        decisions = self._classify(rows) if not validation_errors else []

        statuses = {ingredient: "ERROR" for ingredient in EXPECTED_INGREDIENTS}
        for decision in decisions:
            statuses[decision["row"]["ingredient_name"]] = decision["status"]

        create_count = sum(item["status"] == "CREATE 예정" for item in decisions)
        reuse_count = sum(item["status"] == "REUSE 예정" for item in decisions)
        conflict_count = sum(item["status"] == "CONFLICT" for item in decisions)
        error_count = len(validation_errors)

        self.stdout.write(f"입력 CSV row 수: {len(rows)}")
        self.stdout.write(f"신규 생성 예정 row 수: {create_count}")
        self.stdout.write(f"기존 재사용 row 수: {reuse_count}")
        self.stdout.write(f"중복/충돌 row 수: {conflict_count}")
        self.stdout.write(f"오류 row 수: {error_count}")
        for ingredient in EXPECTED_INGREDIENTS:
            self.stdout.write(f"{ingredient}: {statuses[ingredient]}")
        for error in validation_errors:
            self.stderr.write(error)

        if validation_errors or conflict_count:
            raise CommandError("검증 오류 또는 DB 충돌이 있어 작업을 중단했습니다.")

        if dry_run:
            self.stdout.write(self.style.SUCCESS("dry-run 완료: DB를 변경하지 않았습니다."))
            return

        with transaction.atomic():
            for decision in decisions:
                if decision["status"] == "CREATE 예정":
                    Drug.objects.create(**decision["row"])

        self.stdout.write(
            self.style.SUCCESS(
                f"적재 완료: {create_count}건 생성, {reuse_count}건 재사용"
            )
        )

    def _read_and_validate(self, csv_path):
        if not csv_path.is_file():
            raise CommandError(f"CSV 파일을 찾을 수 없습니다: {csv_path}")

        errors = []
        rows = []
        seen_ingredients = set()
        allowed_routes = {choice for choice, _label in DrugRoute.choices}

        with csv_path.open(encoding="utf-8-sig", newline="") as csv_file:
            reader = csv.DictReader(csv_file)
            missing_headers = [field for field in DRUG_FIELDS if field not in (reader.fieldnames or [])]
            if missing_headers:
                raise CommandError(
                    "CSV 필수 header가 없습니다: " + ", ".join(missing_headers)
                )

            for line_number, source_row in enumerate(reader, start=2):
                row = {
                    field: (source_row.get(field) or "").strip()
                    for field in DRUG_FIELDS
                }
                ingredient_name = row["ingredient_name"]

                for required_field in (
                    "drug_name",
                    "ingredient_name",
                    "efficacy_class_code",
                    "atc_code",
                ):
                    if not row[required_field]:
                        errors.append(f"{line_number}행: {required_field} 값이 없습니다.")

                if ingredient_name not in EXPECTED_INGREDIENTS:
                    errors.append(
                        f"{line_number}행: 허용되지 않은 성분입니다: "
                        f"{ingredient_name or '(빈 값)'}"
                    )
                normalized_name = ingredient_name.casefold()
                if normalized_name in seen_ingredients:
                    errors.append(
                        f"{line_number}행: ingredient_name이 중복되었습니다: "
                        f"{ingredient_name}"
                    )
                seen_ingredients.add(normalized_name)

                if row["route"] and row["route"] not in allowed_routes:
                    errors.append(f"{line_number}행: 잘못된 route입니다: {row['route']}")

                if row["strength"]:
                    try:
                        row["strength"] = Decimal(row["strength"])
                    except InvalidOperation:
                        errors.append(
                            f"{line_number}행: strength를 Decimal로 변환할 수 없습니다."
                        )

                for field in NULLABLE_FIELDS:
                    if row[field] == "":
                        row[field] = None
                rows.append(row)

        expected_names = {name.casefold() for name in EXPECTED_INGREDIENTS}
        missing_names = expected_names - seen_ingredients
        if len(rows) != len(EXPECTED_INGREDIENTS):
            errors.append(
                f"CSV는 정확히 {len(EXPECTED_INGREDIENTS)}행이어야 합니다: "
                f"현재 {len(rows)}행"
            )
        if missing_names:
            display_names = [
                name for name in EXPECTED_INGREDIENTS if name.casefold() in missing_names
            ]
            errors.append("필수 성분이 없습니다: " + ", ".join(display_names))
        return rows, errors

    def _classify(self, rows):
        decisions = []
        for row in rows:
            duplicate_query = Q(ingredient_name__iexact=row["ingredient_name"])
            if row["hira_ingredient_code"]:
                duplicate_query |= Q(hira_ingredient_code=row["hira_ingredient_code"])
            candidates = list(Drug.objects.filter(duplicate_query).only("id")[:2])
            if len(candidates) > 1:
                status = "CONFLICT"
            elif candidates:
                status = "REUSE 예정"
            else:
                status = "CREATE 예정"
            decisions.append({"row": row, "status": status})
        return decisions
