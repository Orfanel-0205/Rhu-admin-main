// src/utils/printItr.ts
//
// Individual Treatment Record (ITR) print/export.
//
// Renders a SELF-CONTAINED document in a brand-new window — no SPA, no sidebar,
// no app chrome — so the clinical print never picks up the admin layout the way
// a bare window.print() of the live page did. Fields the system actually
// captures are filled in; fields the paper form has but the system does not
// track (LMP, blood type, past-medical-history checkboxes, pediatric measures a
// given patient didn't record, etc.) render as blank lines/boxes for the RHU
// staff to hand-write after printing — matching the real form's working-document
// purpose. Prints cleanly to a printer and to "Save as PDF".

export interface ItrPrintData {
  consultationDate?: string | null;
  philhealth?: string | null;
  clientType?: "M" | "D" | null;

  fullName?: string | null;
  address?: string | null;
  age?: string | null;
  birthdate?: string | null;
  sex?: string | null;
  civilStatus?: string | null;
  religion?: string | null;
  education?: string | null;

  // Vital signs (blank where not captured)
  height?: string | null;
  weight?: string | null;
  bmi?: string | null;
  temperature?: string | null;
  bloodPressure?: string | null;
  spo2?: string | null;
  heartRate?: string | null;
  pulseRate?: string | null;
  respiratoryRate?: string | null;
  bloodType?: string | null;
  visualAcuityLeft?: string | null;
  visualAcuityRight?: string | null;

  guardian?: string | null;

  // Personal/social + past medical (free-text the system has; checkboxes stay blank)
  personalSocialHistory?: string | null;
  pastMedicalHistory?: string | null;
  allergies?: string | null;

  // Pediatric (0–24 months)
  isPediatric?: boolean;
  lengthCm?: string | null;
  headCircumferenceCm?: string | null;
  skinfoldThicknessCm?: string | null;
  waistCm?: string | null;
  hipCm?: string | null;
  limbsCm?: string | null;
  muacCm?: string | null;

  // General survey
  awakeAndAlert?: boolean;
  alteredSensorium?: boolean;

  // SOAP
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;

  remarksDiagnosis?: string | null;
  prescribedDrugs?: string | null;

  attendingName?: string | null;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A labeled value that sits on an underline; blank underline when no value. */
function field(label: string, value?: string | null, minWidth = 120): string {
  return `<span class="fld"><span class="lbl">${esc(label)}</span><span class="val" style="min-width:${minWidth}px">${esc(value) || "&nbsp;"}</span></span>`;
}

/** Y / N checkbox pair — always blank (hand-marked), matching the paper form. */
function ynBox(label: string): string {
  return `<span class="yn"><span class="box"></span>Y&nbsp;&nbsp;<span class="box"></span>N&nbsp;:${esc(label)}</span>`;
}

/** A single labeled checkbox (blank). */
function checkBox(label: string, checked = false): string {
  return `<span class="chk"><span class="box${checked ? " on" : ""}">${checked ? "✓" : ""}</span>${esc(label)}</span>`;
}

/** A free-text block area (multi-line), preserving newlines. */
function block(value?: string | null): string {
  const text = esc(value).replace(/\n/g, "<br>");
  return text || "&nbsp;";
}

function buildHtml(d: ItrPrintData): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Individual Treatment Record</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 11px; margin: 0; }
  .sheet { width: 100%; border: 1.5px solid #000; }
  .hdr { text-align: center; padding: 6px 8px; border-bottom: 1.5px solid #000; }
  .hdr .muni { font-size: 11px; }
  .hdr .office { font-size: 14px; font-weight: 800; }
  .hdr .itr { font-size: 12px; font-weight: 700; font-style: italic; }
  .row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 4px 14px; padding: 4px 8px; border-bottom: 1px solid #000; }
  .row.tight { padding: 3px 8px; }
  .sec { padding: 4px 8px; border-bottom: 1px solid #000; }
  .sec-title { font-weight: 800; background: #eee; padding: 3px 8px; border-bottom: 1px solid #000; }
  .fld { display: inline-flex; align-items: flex-end; gap: 4px; }
  .lbl { font-weight: 700; white-space: nowrap; }
  .val { border-bottom: 1px solid #000; padding: 0 4px; display: inline-block; min-height: 14px; }
  .grow .val { flex: 1; }
  .yn, .chk { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; margin-right: 6px; }
  .box { width: 11px; height: 11px; border: 1px solid #000; display: inline-block; text-align: center; line-height: 10px; font-size: 10px; }
  .box.on { font-weight: 900; }
  .soap { padding: 6px 8px; border-bottom: 1px solid #000; }
  .soap .ln { display: flex; gap: 6px; margin-bottom: 6px; }
  .soap .k { font-weight: 800; width: 16px; }
  .soap .v { flex: 1; border-bottom: 1px solid #000; min-height: 30px; padding: 2px 2px; }
  .area { min-height: 60px; padding: 4px 2px; }
  .rx { min-height: 150px; padding: 4px 2px; }
  .sign { padding: 24px 8px 8px; }
  .sign .name { font-weight: 800; border-top: 1px solid #000; display: inline-block; padding: 2px 40px 0; margin-top: 26px; }
  .sign .role { font-size: 10px; }
  .cols3 > * { flex: 1 1 30%; }
  .muted { color: #333; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="hdr">
      <div class="muni">Municipality of Malasiqui</div>
      <div class="office">OFFICE OF THE MUNICIPAL HEALTH OFFICER</div>
      <div class="itr">Individual Treatment Record</div>
    </div>

    <div class="row tight">
      ${field("Consultation Date:", d.consultationDate, 150)}
      ${field("PhilHealth #:", d.philhealth, 150)}
      <span class="chk" style="margin-left:auto">Client Type: ${checkBox("M", d.clientType === "M")} ${checkBox("D", d.clientType === "D")}</span>
    </div>

    <div class="row grow">
      <span class="fld" style="flex:1">${field("Full Name:", d.fullName, 320)}</span>
      ${field("Address:", d.address, 200)}
    </div>

    <div class="row cols3">
      ${field("Age:", d.age, 40)}
      ${field("Bdate:", d.birthdate, 100)}
      ${field("Gender:", d.sex, 60)}
      ${field("Civil Status:", d.civilStatus, 60)}
      ${field("Religion:", d.religion, 90)}
      ${field("Education:", d.education, 90)}
    </div>

    <div class="row">
      <strong>V/S:</strong>
      ${field("Ht:", d.height, 40)}
      ${field("Wt:", d.weight, 40)}
      ${field("BMI:", d.bmi, 40)}
      ${field("Temp(°C):", d.temperature, 40)}
      ${field("BP(mm/Hg):", d.bloodPressure, 55)}
      ${field("SpO2:", d.spo2, 40)}
      ${field("HR:", d.heartRate, 40)}
      ${field("PR:", d.pulseRate, 40)}
      ${field("RR:", d.respiratoryRate, 40)}
    </div>

    <div class="row">
      ${field("Blood Type:", d.bloodType, 50)}
      ${field("Visual Acuity  L:", d.visualAcuityLeft, 50)}
      ${field("R:", d.visualAcuityRight, 50)}
    </div>

    <div class="row grow">
      <span class="fld" style="flex:1">${field("Guardian's Name:", d.guardian, 260)}</span>
      ${field("Bdate:", "", 100)}
      ${field("Cp #:", "", 110)}
    </div>

    <div class="sec-title">For females only:</div>
    <div class="row cols3">
      ${field("No. of child:", "", 40)}
      ${field("LMP:", "", 90)}
      ${field("Period Duration:", "", 40)}
      ${field("Cycle:", "", 40)}
      ${field("FP Method:", "", 110)}
      ${field("Menopausal Age:", "", 40)}
    </div>

    <div class="sec-title">Personal/Social History</div>
    <div class="row">
      ${ynBox("Smoking")}
      ${ynBox("Alcohol Intake")}
      ${d.personalSocialHistory ? `<span class="muted">(${block(d.personalSocialHistory)})</span>` : ""}
    </div>

    <div class="sec-title">Past Medical History</div>
    <div class="row">
      ${ynBox("Cancer")} ${ynBox("Heart Disease")} ${ynBox("Hypertension")}
    </div>
    <div class="row">
      ${ynBox("Allergies")} ${ynBox("Stroke")} ${ynBox("COPD/emphysema/bronchitis")}
    </div>
    <div class="row">
      ${ynBox("Diabetes")} ${ynBox("Bronchial Asthma")} ${ynBox("Tuberculosis")}
      ${checkBox("Others")} ${checkBox("NONE")}
    </div>
    ${
      d.pastMedicalHistory || d.allergies
        ? `<div class="row"><span class="muted">Recorded: ${block(
            [d.pastMedicalHistory, d.allergies ? `Allergies: ${d.allergies}` : ""]
              .filter(Boolean)
              .join(" · ")
          )}</span></div>`
        : ""
    }

    <div class="sec-title">Pediatric Client aged 0-24 months</div>
    <div class="row cols3">
      ${field("Length(cm):", d.isPediatric ? d.lengthCm : "", 40)}
      ${field("Head Circ.(cm):", d.isPediatric ? d.headCircumferenceCm : "", 40)}
      ${field("Skinfold(cm):", d.isPediatric ? d.skinfoldThicknessCm : "", 40)}
    </div>
    <div class="row">
      <strong>Body Circ.:</strong>
      ${field("Waist(cm):", d.isPediatric ? d.waistCm : "", 40)}
      ${field("Hip(cm):", d.isPediatric ? d.hipCm : "", 40)}
      ${field("Limbs(cm):", d.isPediatric ? d.limbsCm : "", 40)}
      ${field("MUAC(cm):", d.isPediatric ? d.muacCm : "", 40)}
    </div>

    <div class="sec-title">General Survey</div>
    <div class="row">
      ${checkBox("Awake and Alert", !!d.awakeAndAlert)}
      ${checkBox("Altered Sensorium", !!d.alteredSensorium)}
    </div>

    <div class="sec-title">Chief Complaint</div>
    <div class="soap">
      <div class="ln"><span class="k">S-</span><span class="v">${block(d.subjective)}</span></div>
      <div class="ln"><span class="k">O-</span><span class="v">${block(d.objective)}</span></div>
      <div class="ln"><span class="k">A-</span><span class="v">${block(d.assessment)}</span></div>
      <div class="ln"><span class="k">P-</span><span class="v">${block(d.plan)}</span></div>
    </div>

    <div class="sec-title">Remarks &amp; Diagnosis</div>
    <div class="sec"><div class="area">${block(d.remarksDiagnosis)}</div></div>

    <div class="sec-title">Prescribe Drug/s</div>
    <div class="sec"><div class="rx">${block(d.prescribedDrugs)}</div></div>

    <div class="sign">
      <div class="name">${esc(d.attendingName) || "&nbsp;"}</div>
      <div class="role">Attending Physician / RHU Staff</div>
    </div>
  </div>

  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { try { window.print(); } catch (e) {} }, 250);
    });
  </script>
</body>
</html>`;
}

export function printItrForm(data: ItrPrintData): void {
  const w = window.open("", "_blank", "width=900,height=1200");
  if (!w) {
    if (typeof globalThis.alert === "function") {
      globalThis.alert(
        "Please allow pop-ups for this site to print the Individual Treatment Record."
      );
    }
    return;
  }
  w.document.open();
  w.document.write(buildHtml(data));
  w.document.close();
  w.focus();
}
