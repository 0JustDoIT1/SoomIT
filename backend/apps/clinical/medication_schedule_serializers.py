from rest_framework import serializers

from apps.patients.models import MedicationSchedule, MedicationScheduleItem

from .models import DrugRoute, Prescription, PrescriptionItem


class DoctorMedicationScheduleSerializer(serializers.ModelSerializer):
    prescription_item_ids = serializers.PrimaryKeyRelatedField(
        source="prescription_items", queryset=PrescriptionItem.objects.all(), many=True, write_only=True
    )
    items = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = MedicationSchedule
        fields = [
            "id", "prescription", "reminder_time", "start_date", "end_date", "repeat_type",
            "repeat_weekdays", "cycle_days", "enabled", "prescription_item_ids", "items",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "prescription", "enabled", "items", "created_at", "updated_at"]

    def validate(self, attrs):
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        repeat_type = attrs.get("repeat_type", getattr(self.instance, "repeat_type", MedicationSchedule.RepeatType.DAILY))
        weekdays = attrs.get("repeat_weekdays", getattr(self.instance, "repeat_weekdays", []))
        cycle_days = attrs.get("cycle_days", getattr(self.instance, "cycle_days", []))
        if start is None:
            raise serializers.ValidationError({"start_date": "start_date is required."})
        if end is not None and end < start:
            raise serializers.ValidationError({"end_date": "end_date must not precede start_date."})
        if repeat_type == MedicationSchedule.RepeatType.WEEKLY:
            if not isinstance(weekdays, list) or not weekdays or any(not isinstance(day, int) or day < 0 or day > 6 for day in weekdays):
                raise serializers.ValidationError({"repeat_weekdays": "WEEKLY schedules require weekdays from 0 (Monday) through 6 (Sunday)."})
        elif weekdays:
            raise serializers.ValidationError({"repeat_weekdays": "repeat_weekdays is only valid for WEEKLY schedules."})
        if repeat_type == MedicationSchedule.RepeatType.CYCLE_DAY:
            if not isinstance(cycle_days, list) or not cycle_days or any(not isinstance(day, int) or day < 1 for day in cycle_days):
                raise serializers.ValidationError({"cycle_days": "CYCLE_DAY schedules require positive treatment cycle days."})
        elif cycle_days:
            raise serializers.ValidationError({"cycle_days": "cycle_days is only valid for CYCLE_DAY schedules."})
        return attrs

    def validate_prescription_items(self, items):
        prescription = self.context["prescription"]
        if not items:
            raise serializers.ValidationError("At least one prescription item is required.")
        if any(item.prescription_id != prescription.id for item in items):
            raise serializers.ValidationError("Every prescription item must belong to this prescription.")
        non_oral = [str(item.id) for item in items if item.route != DrugRoute.ORAL]
        if non_oral:
            raise serializers.ValidationError("Only oral prescription items can be included in a patient medication schedule.")
        return items

    def create(self, validated_data):
        items = validated_data.pop("prescription_items")
        prescription = self.context["prescription"]
        schedule = MedicationSchedule.objects.create(
            patient_account=self.context["patient_account"], prescription=prescription, **validated_data
        )
        MedicationScheduleItem.objects.bulk_create([
            MedicationScheduleItem(medication_schedule=schedule, prescription_item=item) for item in items
        ])
        return schedule

    def update(self, instance, validated_data):
        items = validated_data.pop("prescription_items", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if items is not None:
            instance.items.all().delete()
            MedicationScheduleItem.objects.bulk_create([
                MedicationScheduleItem(medication_schedule=instance, prescription_item=item) for item in items
            ])
        return instance

    def get_items(self, obj):
        return [
            {
                "prescription_item_id": str(item.prescription_item_id),
                "drug_name": item.prescription_item.drug.drug_name,
                "route": item.prescription_item.route,
                "frequency": item.prescription_item.frequency,
            }
            for item in obj.items.select_related("prescription_item__drug")
        ]


class PrescriptionFinalizeSerializer(serializers.Serializer):
    medication_schedules = DoctorMedicationScheduleSerializer(many=True, required=False)

    def validate_medication_schedules(self, schedules):
        reminder_times = [item["reminder_time"] for item in schedules]
        if len(reminder_times) != len(set(reminder_times)):
            raise serializers.ValidationError("A prescription cannot have duplicate reminder times.")
        return schedules
