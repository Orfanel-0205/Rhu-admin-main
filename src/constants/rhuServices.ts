// src/constants/rhuServices.ts
// Canonical catalog of RHU program services used by the Event Creation
// "RHU Service Offered" classification. Grouped exactly as specified by the
// RHU service list; sub-services are individually selectable, and categories
// without sub-services are selectable as a whole.

export interface ServiceGroup {
  /** Category heading shown in the dropdown. */
  label: string;
  /** Selectable options. For categories without sub-services this is the category itself. */
  options: string[];
}

export const RHU_SERVICE_GROUPS: ServiceGroup[] = [
  {
    label: "1. Konsulta, Maternal and Newborn Care Packages",
    options: [
      "Prenatal Care",
      "Post-natal Care",
      "Labor and Delivery (Birthing Clinics)",
      "Care of the Newborn",
      "Consultation / Outpatient Services",
    ],
  },
  {
    label: "2. Family Planning Services",
    options: [
      "Counseling on Informed Consent and Volunteerism",
      "Provision of Family Planning Methods",
      "Management of Family Planning Complications",
    ],
  },
  { label: "3. Child Care Services", options: ["Child Care Services"] },
  { label: "4. Immunization", options: ["Immunization"] },
  {
    label: "5. Nutrition Services",
    options: [
      "Micronutrient Supplementation",
      "Growth Monitoring",
      "Nutrition Counseling",
    ],
  },
  { label: "6. Adolescent Services", options: ["Adolescent Services"] },
  { label: "7. Dental Services", options: ["Dental Services"] },
  { label: "8. TB-DOTS Services", options: ["TB-DOTS Services"] },
  {
    label: "9. Morbid Clinics",
    options: ["Clinic-Based Consultation", "Outreach Medical Consultation"],
  },
  {
    label: "10. Minor Surgery",
    options: [
      "Wound Suturing",
      "Suture Removal",
      "Incision and Drainage",
      "Debridement",
      "Excision of Small Cyst",
      "Circumcision",
    ],
  },
  { label: "11. Referral Services", options: ["Referral Services"] },
  {
    label: "12. Ancillary Services",
    options: [
      "Laboratory Examination",
      "Chest X-ray",
      "ECG",
      "Pharmacy",
      "Ambulance Service",
    ],
  },
  {
    label: "13. Administrative Services",
    options: ["Medical Certificates", "Sanitary Permits"],
  },
  {
    label: "14. Environmental Health and Sanitation",
    options: ["Environmental Health and Sanitation"],
  },
  {
    label: "15. HIV/AIDS and STI Counseling",
    options: ["HIV/AIDS and STI Counseling"],
  },
  {
    label: "16. Leprosy Control and Prevention",
    options: ["Leprosy Control and Prevention"],
  },
  {
    label: "17. Healthy Lifestyle & Non-Communicable Disease Prevention",
    options: [
      "Smoking Cessation",
      "Alcohol Drinking Moderation",
      "Exercise",
      "Sleep and Rest",
      "Stress Management",
      "Blood Pressure Monitoring",
      "Weight Monitoring",
    ],
  },
  {
    label: "18. Dengue Control and Prevention",
    options: ["Dengue Control and Prevention"],
  },
  {
    label: "19. Rabies Control and Prevention",
    options: ["Rabies Control and Prevention"],
  },
  {
    label: "20. Infectious and Communicable Disease Control and Prevention",
    options: ["Infectious and Communicable Disease Control and Prevention"],
  },
  { label: "21. Mental Health", options: ["Mental Health"] },
];

export const ALL_RHU_SERVICES: string[] = RHU_SERVICE_GROUPS.flatMap(
  (group) => group.options
);
