// src/lib/rolePrompts.ts
//
// The staff assistant's starter questions, by role (Nov 2026).
//
// Everyone used to be offered the same chips -- "How do I approve users?",
// "How do I send SMS?", "Explain the analytics" -- so a nurse or a BHW was
// invited to ask about screens the server refuses them. Each role now starts
// from its own work. The server shapes the answers the same way
// (app/Services/Ai/RoleGuide.php).

import { roleOf } from "./roleAccess";

const ROLE_GROUPS: Record<string, string> = {
  mho: "mho",
  mho_admin: "mho",
  doctor: "doctor",
  nurse: "nurse",
  head_nurse: "nurse",
  midwife: "midwife",
  bhw: "bhw",
  super_admin: "super_admin",
  superadmin: "super_admin",
  admin: "desk",
  staff: "desk",
  staff_admin: "desk",
  rhu_admin: "desk",
  rhu_staff: "desk",
};

const PROMPTS: Record<string, string[]> = {
  mho: [
    "Which consultations are waiting for me to complete?",
    "How do I approve a new staff account?",
    "How do I save my signature for prescriptions?",
    "Explain this week's analytics and dengue heatmap.",
  ],
  doctor: [
    "How do I complete a consultation?",
    "How do I issue an e-prescription or lab request?",
    "How do I save my signature for prescriptions?",
    "How do I start a telemedicine call?",
  ],
  nurse: [
    "How do I add a walk-in to the queue?",
    "How do I record vital signs in the SOAP?",
    "How do I screen a telemedicine request?",
    "How do I release medicines from a prescription?",
  ],
  midwife: [
    "How do I record a prenatal visit?",
    "How do I set a follow-up for a mother?",
    "How do I add a walk-in to the queue?",
    "How do I send my SOAP to the MHO?",
  ],
  bhw: [
    "How do I add a walk-in at a barangay event?",
    "How do I set a follow-up for a patient?",
    "How do I fill in my part of the SOAP?",
    "What happens if I lose signal while saving?",
  ],
  desk: [
    "How do I call the next patient?",
    "How do I post an announcement to the mobile app?",
    "How do I make a medicine dispensing report?",
    "How do I approve or check users?",
  ],
  super_admin: [
    "How do I add or close an RHU facility?",
    "How do I change a user's role?",
    "How do I check the SMS credits?",
    "Where are the API keys kept?",
  ],
};

/** Starter questions for this user's role; null when the role has none of its own. */
export function promptsForRole(user: any): string[] | null {
  const group = ROLE_GROUPS[roleOf(user)];
  return group ? PROMPTS[group] : null;
}
