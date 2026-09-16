from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.ai_results.models import AiResult, AnalysisType
from apps.radiology.services.ct_analysis_inference import (
    CtAnalysisInferenceError,
    request_ct_cornerstone_backfill,
)
from apps.radiology.tasks import _cornerstone_result_files


class Command(BaseCommand):
    help = (
        "Add Cornerstone3D labelmap artifacts to CT analyses that ran before that "
        "pipeline step existed. Reads each analysis's already-stored NIfTI masks "
        "and converts them into a labelmap; no model inference is re-run."
    )

    def add_arguments(self, parser):
        parser.add_argument("--execute", action="store_true")
        parser.add_argument(
            "--analysis-id",
            action="append",
            dest="analysis_ids",
            help="Limit the backfill to one analysis UUID. May be repeated.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Regenerate and replace an existing Cornerstone labelmap.",
        )

    def handle(self, *args, **options):
        execute = options["execute"]
        analysis_ids = options["analysis_ids"] or []
        force = options["force"]

        results = (
            AiResult.objects.filter(ai_analysis__analysis_type=AnalysisType.CT_ANALYSIS)
            .select_related("ai_analysis")
            .order_by("created_at")
        )
        if analysis_ids:
            results = results.filter(ai_analysis_id__in=analysis_ids)
        backfilled = 0
        skipped = 0
        for result in results:
            payload = result.result_payload if isinstance(result.result_payload, dict) else {}
            artifact_uri = payload.get("artifact_uri")
            case_id = payload.get("case_id")
            if not artifact_uri or not case_id:
                skipped += 1
                continue

            existing = payload.get("cornerstone_segmentation")
            if not force and isinstance(existing, dict) and existing.get("labelmap_uri"):
                skipped += 1
                continue

            self.stdout.write(f"{result.ai_analysis_id}: {artifact_uri}")
            if not execute:
                backfilled += 1
                continue

            try:
                backfill = request_ct_cornerstone_backfill(
                    artifact_uri=artifact_uri, case_id=str(case_id),
                )
            except CtAnalysisInferenceError as exc:
                raise CommandError(f"{result.ai_analysis_id}: {exc}") from exc

            with transaction.atomic():
                locked = AiResult.objects.select_for_update().get(id=result.id)
                locked_payload = dict(locked.result_payload or {})
                locked_payload["cornerstone_manifest_uri"] = backfill["cornerstone_manifest_uri"]
                locked_payload["cornerstone_segmentation"] = backfill["cornerstone_segmentation"]
                locked.result_payload = locked_payload
                locked.result_files = list(locked.result_files or []) + _cornerstone_result_files(
                    backfill["cornerstone_segmentation"],
                )
                locked.save(update_fields=["result_payload", "result_files"])
            backfilled += 1
            self.stdout.write(self.style.SUCCESS(f"Backfilled {result.ai_analysis_id}"))

        action = "backfilled" if execute else "planned"
        self.stdout.write(self.style.SUCCESS(
            f"CT Cornerstone labelmaps {action}: {backfilled} (skipped {skipped})",
        ))
