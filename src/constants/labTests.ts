// src/constants/labTests.ts
//
// The laboratory tests RHU Malasiqui actually offers.
//
// The RHU's IT staff supplied this catalogue from the system the unit runs
// today, and asked for a replacement form because theirs is hard to use: about
// thirty unordered checkboxes in two columns inside a scrolling modal, with no
// grouping and no search. The tests are theirs; only the arrangement is ours.
//
// `value` is what gets stored in prescriptions.lab_tests and what the printed
// request matches on, so it must never change once a test has been requested
// even once — every saved prescription would quietly stop ticking that box.
// `label` is what a clinician reads and can be reworded freely. That is why
// the eleven original tests keep terse values ('CBC', 'FBS', 'B.U.A') while
// reading as the full names the RHU uses.
//
// This must stay in step with app/Support/LabTestCatalogue.php on the backend.
// The backend copy is what the printed PDF is built from, so a test added only
// here would be tickable on screen and silently missing from the printout.

export interface LabTest {
  value: string;
  label: string;
}

export interface LabTestGroupDef {
  group: string;
  tests: LabTest[];
}

export const LABORATORY_GROUPS: LabTestGroupDef[] = [
  {
    group: "Hematology",
    tests: [
      { value: "CBC", label: "Complete Blood Count (CBC)" },
      { value: "Hematology", label: "Hematology" },
      { value: "Blood Chemistry", label: "Blood Chemistry" },
    ],
  },
  {
    group: "Blood sugar",
    tests: [
      { value: "FBS", label: "Fasting Blood Sugar (FBS)" },
      { value: "Random Blood Sugar", label: "Random Blood Sugar (RBS)" },
      {
        value: "Oral Glucose Tolerance Test",
        label: "Oral Glucose Tolerance Test (OGTT)",
      },
      { value: "HBA1C", label: "HbA1c" },
    ],
  },
  {
    group: "Lipids and organ function",
    tests: [
      { value: "Total Lipid Profile", label: "Lipid Profile" },
      { value: "Creatinine", label: "Creatinine" },
      { value: "B.U.N", label: "Blood Urea Nitrogen (BUN)" },
      { value: "B.U.A", label: "Blood Uric Acid (BUA)" },
      { value: "ALT", label: "ALT (SGPT)" },
      { value: "AST", label: "AST (SGOT)" },
    ],
  },
  {
    group: "Urine and stool",
    tests: [
      { value: "Urinalysis", label: "Urinalysis" },
      { value: "Fecalysis", label: "Fecalysis" },
      { value: "Fecal Occult Blood Test", label: "Fecal Occult Blood Test" },
    ],
  },
  {
    // The National TB Programme tests, kept together because they are ordered
    // together and reported together.
    group: "Tuberculosis",
    tests: [
      {
        value: "Direct Sputum Smear Microscopy",
        label: "Direct Sputum Smear Microscopy (DSSM)",
      },
      { value: "MTB/RIF Exam", label: "MTB/RIF Exam (GeneXpert)" },
      { value: "PPD Test (Tuberculosis)", label: "PPD Test (Tuberculin)" },
    ],
  },
  {
    group: "Infectious disease",
    tests: [
      { value: "Dengue RDT", label: "Dengue RDT" },
      { value: "Malaria RDT", label: "Malaria RDT" },
      { value: "Syphilis Test", label: "Syphilis Test" },
      { value: "Serology", label: "Serology" },
    ],
  },
  {
    group: "Microscopy and smears",
    tests: [
      { value: "Microscopy", label: "Microscopy" },
      { value: "Gram Stain", label: "Gram Stain" },
      { value: "Wet Smear", label: "Wet Smear" },
      {
        value: "10% Potassium Hydroxide (KOH)",
        label: "10% Potassium Hydroxide (KOH)",
      },
      { value: "Skin Slit Smear", label: "Skin Slit Smear" },
    ],
  },
  {
    group: "Women's health",
    tests: [
      { value: "Pap Smear", label: "Pap Smear" },
      { value: "Cervical Cancer Screening", label: "Cervical Cancer Screening" },
    ],
  },
  {
    group: "Procedures",
    tests: [
      { value: "Electrocardiogram (ECG)", label: "Electrocardiogram (ECG)" },
      { value: "Biopsy", label: "Biopsy" },
    ],
  },
];

// The RHU list carries a bare "Chest X-ray" and a bare "X-ray". The two
// view-specific entries here predate it and are kept, because a request that
// does not say which view leaves the radiographer guessing. A bare "Chest
// X-ray" is therefore not offered a second time.
export const XRAY_GROUPS: LabTestGroupDef[] = [
  {
    group: "Chest",
    tests: [
      { value: "CXR - PA View", label: "Chest X-ray — PA View" },
      {
        value: "CXR - Apicolordotic View",
        label: "Chest X-ray — Apicolordotic View",
      },
    ],
  },
  {
    group: "Other",
    tests: [
      { value: "X-ray", label: "X-ray — other region (name it in Others)" },
    ],
  },
];

// The RHU list has a single bare "Ultrasound". These six sites predate it and
// are more useful to a sonographer, so no bare entry is added — an unlisted
// area goes in Others.
export const ULTRASOUND_GROUPS: LabTestGroupDef[] = [
  {
    group: "Abdomen",
    tests: [
      { value: "Whole Abdomen", label: "Whole Abdomen" },
      { value: "Upper Abdomen", label: "Upper Abdomen" },
      { value: "Lower Abdomen", label: "Lower Abdomen" },
    ],
  },
  {
    group: "Other areas",
    tests: [
      { value: "HBT", label: "Hepatobiliary Tree (HBT)" },
      { value: "KUB", label: "Kidneys, Ureters, Bladder (KUB)" },
      { value: "Prostate", label: "Prostate" },
    ],
  },
];

/** Every test in a section, flattened, in display order. */
export function flattenTests(groups: LabTestGroupDef[]): LabTest[] {
  return groups.flatMap((group) => group.tests);
}

/**
 * The label for a stored value.
 *
 * Falls back to the value so a test requested before it was renamed or retired
 * still reads as something, rather than disappearing from a record.
 */
export function labelForValue(
  groups: LabTestGroupDef[],
  value: string
): string {
  return (
    flattenTests(groups).find((test) => test.value === value)?.label ?? value
  );
}
