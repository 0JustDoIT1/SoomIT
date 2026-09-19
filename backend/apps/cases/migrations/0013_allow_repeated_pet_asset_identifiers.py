from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0012_allow_repeated_ct_asset_identifiers"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="caseimageasset",
            name="uq_caseimageasset_storage_uri_non_ct",
        ),
        migrations.RemoveConstraint(
            model_name="caseimageasset",
            name="uq_caseimageasset_series_uid_non_ct",
        ),
        migrations.RemoveConstraint(
            model_name="caseimageasset",
            name="uq_caseimageasset_orthanc_series_non_ct",
        ),
        migrations.AddConstraint(
            model_name="caseimageasset",
            constraint=models.UniqueConstraint(
                condition=~models.Q(image_type__in=["CT", "PET"]),
                fields=("storage_uri",),
                name="uq_caseimageasset_storage_uri_non_ct",
            ),
        ),
        migrations.AddConstraint(
            model_name="caseimageasset",
            constraint=models.UniqueConstraint(
                condition=~models.Q(image_type__in=["CT", "PET"]),
                fields=("series_instance_uid",),
                name="uq_caseimageasset_series_uid_non_ct",
            ),
        ),
        migrations.AddConstraint(
            model_name="caseimageasset",
            constraint=models.UniqueConstraint(
                condition=~models.Q(image_type__in=["CT", "PET"]),
                fields=("orthanc_series_id",),
                name="uq_caseimageasset_orthanc_series_non_ct",
            ),
        ),
    ]
