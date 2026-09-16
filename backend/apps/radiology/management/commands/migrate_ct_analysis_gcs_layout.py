from copy import deepcopy
from urllib.parse import urlparse

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from google.cloud import storage

from apps.ai_results.models import AiResult, AnalysisType
from apps.radiology.services.ct_analysis_storage import build_ct_analysis_output_uri


def _replace_prefix(value, old_prefix, new_prefix):
    if isinstance(value, str):
        return new_prefix + value[len(old_prefix):] if value.startswith(old_prefix) else value
    if isinstance(value, list):
        return [_replace_prefix(item, old_prefix, new_prefix) for item in value]
    if isinstance(value, dict):
        return {
            key: _replace_prefix(item, old_prefix, new_prefix)
            for key, item in value.items()
        }
    return value


def _parse_gcs_prefix(uri):
    parsed = urlparse(uri)
    if parsed.scheme != "gs" or not parsed.netloc or not parsed.path.strip("/"):
        raise CommandError(f"Invalid GCS URI: {uri}")
    return parsed.netloc, parsed.path.strip("/") + "/"


class Command(BaseCommand):
    help = "Move legacy CT analysis artifacts into hospital/case/order/analysis prefixes."

    def add_arguments(self, parser):
        parser.add_argument("--execute", action="store_true")
        parser.add_argument(
            "--delete-source",
            action="store_true",
            help="Delete the legacy prefix after copy verification and DB update.",
        )

    def handle(self, *args, **options):
        execute = options["execute"]
        delete_source = options["delete_source"]
        if delete_source and not execute:
            raise CommandError("--delete-source requires --execute")

        client = storage.Client() if execute else None
        results = (
            AiResult.objects.filter(ai_analysis__analysis_type=AnalysisType.CT_ANALYSIS)
            .select_related(
                "ai_analysis__case__patient",
                "ai_analysis__examination_order",
                "ai_analysis__source_image_asset__examination_order",
            )
            .order_by("created_at")
        )
        migrated = 0
        for result in results:
            analysis = result.ai_analysis
            old_uri = (result.result_payload or {}).get("artifact_uri")
            legacy_uri = f"gs://soomit-bucket/ct-analysis/{analysis.case_id}/"
            if old_uri != legacy_uri:
                continue
            order_id = analysis.examination_order_id
            if not order_id and analysis.source_image_asset_id:
                order_id = analysis.source_image_asset.examination_order_id
            if not order_id:
                raise CommandError(f"Analysis {analysis.id} has no examination order")
            new_uri = build_ct_analysis_output_uri(
                hospital_id=analysis.case.patient.hospital_id,
                case_id=analysis.case_id,
                order_id=order_id,
                analysis_id=analysis.id,
            ).rstrip("/") + "/"
            self.stdout.write(f"{old_uri} -> {new_uri}")
            if not execute:
                migrated += 1
                continue

            old_bucket_name, old_prefix = _parse_gcs_prefix(old_uri)
            new_bucket_name, new_prefix = _parse_gcs_prefix(new_uri)
            if old_bucket_name != new_bucket_name:
                raise CommandError("Cross-bucket CT migration is not supported")
            bucket = client.bucket(old_bucket_name)
            source_blobs = list(client.list_blobs(old_bucket_name, prefix=old_prefix))
            if not source_blobs:
                raise CommandError(f"No objects found below {old_uri}")

            copied_names = []
            for blob in source_blobs:
                relative_name = blob.name[len(old_prefix):]
                # Original DICOM remains in Orthanc. Older Phase 1 revisions
                # accidentally uploaded their temporary extracted copies.
                if relative_name.startswith("source/dicom/"):
                    continue
                destination_name = new_prefix + relative_name
                bucket.copy_blob(blob, bucket, destination_name)
                copied_names.append(destination_name)

            destination_names = {
                blob.name for blob in client.list_blobs(new_bucket_name, prefix=new_prefix)
            }
            missing = sorted(set(copied_names) - destination_names)
            if missing:
                raise CommandError(
                    f"Copy verification failed for {new_uri}: {len(missing)} missing object(s)"
                )

            payload = _replace_prefix(deepcopy(result.result_payload), old_uri, new_uri)
            files = _replace_prefix(deepcopy(result.result_files), old_uri, new_uri)
            with transaction.atomic():
                locked = AiResult.objects.select_for_update().get(id=result.id)
                locked.result_payload = payload
                locked.result_files = files
                locked.save(update_fields=["result_payload", "result_files"])
                if not analysis.examination_order_id:
                    analysis.examination_order_id = order_id
                    analysis.save(update_fields=["examination_order"])

            if delete_source:
                for blob in source_blobs:
                    blob.delete()
            migrated += 1
            self.stdout.write(
                self.style.SUCCESS(
                    f"Migrated {analysis.id}: {len(copied_names)} artifacts"
                    + ("; legacy prefix deleted" if delete_source else "")
                )
            )

        action = "migrated" if execute else "planned"
        self.stdout.write(self.style.SUCCESS(f"CT layouts {action}: {migrated}"))
