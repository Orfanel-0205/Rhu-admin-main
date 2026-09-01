// src/constants/targetAudiences.ts
// Preset audience groups for CMS event/announcement targeting, so RHU staff
// pick instead of type. Mirrors the priority groups the RHU actually serves
// (incl. PWDs and other priority-lane groups). "Others" covers anything not
// listed. Serialized into the existing `target_audience` comma string.

export const TARGET_AUDIENCE_OPTIONS: string[] = [
  "Infants (0-11 months)",
  "Children",
  "Adolescents / Youth",
  "Adults",
  "Senior Citizens",
  "Pregnant Women",
  "Lactating Mothers",
  "PWDs (Persons with Disabilities)",
  "Solo Parents",
  "Indigent Families",
  "4Ps Beneficiaries",
  "Farmers / Fisherfolk",
  "Barangay Health Workers",
  "Others",
];
