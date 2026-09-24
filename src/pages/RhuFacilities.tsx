// src/pages/RhuFacilities.tsx
//
// Administration → RHU Facilities. The screen that lets a municipality open a
// third Rural Health Unit without a developer.
//
// Two things are managed here, and the second is the one that matters:
//   1. the facility itself (name, code, contact, whether it is in use);
//   2. which barangays it serves — that mapping is what decides which RHU a
//      resident belongs to, so a new facility does nothing until barangays
//      are moved to it.
//
// Facilities are never deleted. Queue tickets, appointments, prescriptions and
// stock all carry the facility id, so a closed RHU is switched off instead:
// it leaves every picker while its history stays readable.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Building2, Check, MapPin, Plus, RefreshCw, Users as UsersIcon } from "lucide-react";

import { useToast } from "../contexts/ToastContext";
import { useRhuStore } from "../store/rhuStore";
import {
  assignRhuBarangays,
  createRhuFacility,
  getBarangayChoices,
  getRhuFacilities,
  updateRhuFacility,
  type BarangayChoice,
  type RhuFacility,
} from "../services/rhus";

const emptyForm = {
  code: "",
  name: "",
  short_name: "",
  address: "",
  latitude: "",
  longitude: "",
  contact_number: "",
};

export default function RhuFacilities() {
  const toast = useToast();
  const reloadPickers = useRhuStore((state) => state.load);

  const [facilities, setFacilities] = useState<RhuFacility[]>([]);
  const [barangays, setBarangays] = useState<BarangayChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingBarangaysFor, setEditingBarangaysFor] = useState<number | null>(null);
  const [selectedBarangays, setSelectedBarangays] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const [facilityList, barangayList] = await Promise.all([
        getRhuFacilities(),
        getBarangayChoices(),
      ]);

      setFacilities(facilityList);
      setBarangays(barangayList);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Could not load the RHU list.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const unassignedCount = useMemo(
    () => barangays.filter((barangay) => !barangay.rhu_id).length,
    [barangays]
  );

  async function handleCreate() {
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      toast.error(
        "Enter the latitude and longitude. Without them this facility cannot appear on the queue map or the heatmap."
      );
      return;
    }

    if (!form.code.trim() || !form.name.trim() || !form.short_name.trim()) {
      toast.error("Code, full name and short name are required.");
      return;
    }

    setSaving(true);

    try {
      await createRhuFacility({
        code: form.code.trim(),
        name: form.name.trim(),
        short_name: form.short_name.trim(),
        address: form.address.trim() || null,
        latitude,
        longitude,
        contact_number: form.contact_number.trim() || null,
      });

      toast.success(`${form.short_name.trim()} added. Assign its barangays next.`);
      setForm(emptyForm);
      setShowForm(false);
      await load();
      await reloadPickers(true);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message ?? "Could not add this RHU. Check the code is not already used."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(facility: RhuFacility) {
    const turningOff = facility.is_active;

    if (
      turningOff &&
      !window.confirm(
        `Switch off ${facility.short_name}?\n\nIt disappears from every RHU picker. Its records stay, and you can switch it back on.`
      )
    ) {
      return;
    }

    try {
      await updateRhuFacility(facility.id, { is_active: !facility.is_active });
      toast.success(`${facility.short_name} is now ${turningOff ? "switched off" : "active"}.`);
      await load();
      await reloadPickers(true);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Could not change this RHU.");
    }
  }

  async function handleRename(facility: RhuFacility) {
    const nextShort = window.prompt("Short name shown in pickers:", facility.short_name);

    if (nextShort === null) return;

    const nextName = window.prompt("Full name:", facility.name);

    if (nextName === null) return;

    if (!nextShort.trim() || !nextName.trim()) {
      toast.error("Both names are required.");
      return;
    }

    try {
      await updateRhuFacility(facility.id, {
        short_name: nextShort.trim(),
        name: nextName.trim(),
      });
      toast.success("Renamed.");
      await load();
      await reloadPickers(true);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Could not rename this RHU.");
    }
  }

  function openBarangayEditor(facility: RhuFacility) {
    setEditingBarangaysFor(facility.id);
    setSelectedBarangays(new Set(facility.barangay_ids));
  }

  async function saveBarangays(facility: RhuFacility) {
    setSaving(true);

    try {
      await assignRhuBarangays(facility.id, Array.from(selectedBarangays));
      toast.success(`Barangays served by ${facility.short_name} updated.`);
      setEditingBarangaysFor(null);
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Could not save the barangay assignment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={pageStyle}>
      <header style={heroStyle}>
        <p style={eyebrowStyle}>Ka-Agapay · Administration</p>
        <h1 style={titleStyle}>RHU Facilities</h1>
        <p style={heroTextStyle}>
          The Rural Health Units this system serves. Add one when the municipality opens a new
          facility, then choose the barangays it serves — that assignment is what sends residents,
          queues and appointments to the right RHU.
        </p>
      </header>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" style={primaryButton} onClick={() => setShowForm((open) => !open)}>
          <Plus size={16} />
          {showForm ? "Cancel" : "Add an RHU"}
        </button>

        <button type="button" style={secondaryButton} onClick={() => void load()}>
          <RefreshCw size={15} />
          Refresh
        </button>

        {unassignedCount > 0 ? (
          <span style={warningPillStyle}>
            {unassignedCount} barangay(s) not assigned to any RHU
          </span>
        ) : null}
      </div>

      {showForm ? (
        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>New RHU</h2>

          <div style={formGridStyle}>
            <label style={labelStyle}>
              Short name (shown in pickers)
              <input
                style={inputStyle}
                value={form.short_name}
                onChange={(event) => setForm({ ...form, short_name: event.target.value })}
                placeholder="RHU 3"
              />
            </label>

            <label style={labelStyle}>
              Code (no spaces)
              <input
                style={inputStyle}
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
                placeholder="RHU3"
              />
            </label>

            <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
              Full name
              <input
                style={inputStyle}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="RHU 3 Malasiqui (San Julian)"
              />
            </label>

            <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
              Address
              <input
                style={inputStyle}
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
                placeholder="San Julian, Malasiqui, Pangasinan"
              />
            </label>

            <label style={labelStyle}>
              Contact number
              <input
                style={inputStyle}
                value={form.contact_number}
                onChange={(event) => setForm({ ...form, contact_number: event.target.value })}
                placeholder="09XX XXX XXXX"
              />
            </label>

            {/*
                Required, and asked here for a reason.

                Without coordinates a facility cannot be drawn on the queue
                map or the barangay heatmap, and there is no way to work them
                out afterwards without sending someone to stand outside the
                building. The moment the facility is created is the only
                moment anybody knows the answer.
            */}
            <label style={labelStyle}>
              Latitude
              <input
                style={inputStyle}
                value={form.latitude}
                onChange={(event) => setForm({ ...form, latitude: event.target.value })}
                placeholder="15.909129"
                inputMode="decimal"
              />
            </label>

            <label style={labelStyle}>
              Longitude
              <input
                style={inputStyle}
                value={form.longitude}
                onChange={(event) => setForm({ ...form, longitude: event.target.value })}
                placeholder="120.490027"
                inputMode="decimal"
              />
            </label>

            <p style={{ ...hintStyle, gridColumn: "1 / -1" }}>
              Open the facility in Google Maps, long-press the building, and
              copy the two numbers it shows. Latitude first.
            </p>
          </div>

          <button type="button" style={primaryButton} disabled={saving} onClick={() => void handleCreate()}>
            <Check size={16} />
            {saving ? "Saving…" : "Add RHU"}
          </button>
        </section>
      ) : null}

      {loading ? (
        <p style={mutedTextStyle}>Loading facilities…</p>
      ) : (
        <div style={listStyle}>
          {facilities.map((facility) => (
            <section key={facility.id} style={cardStyle}>
              <div style={facilityHeaderStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span style={facilityIconStyle}>
                    <Building2 size={18} />
                  </span>

                  <div style={{ minWidth: 0 }}>
                    <h2 style={sectionTitleStyle}>
                      {facility.short_name}
                      <span style={codePillStyle}>{facility.code}</span>
                      {!facility.is_active ? <span style={offPillStyle}>Switched off</span> : null}
                    </h2>
                    <p style={mutedTextStyle}>{facility.name}</p>
                    {facility.address ? (
                      <p style={mutedTextStyle}>
                        <MapPin size={12} /> {facility.address}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" style={secondaryButton} onClick={() => void handleRename(facility)}>
                    Rename
                  </button>

                  <button
                    type="button"
                    style={secondaryButton}
                    onClick={() => openBarangayEditor(facility)}
                  >
                    Barangays ({facility.barangay_count})
                  </button>

                  <button
                    type="button"
                    style={facility.is_active ? dangerButton : primaryButton}
                    onClick={() => void handleToggleActive(facility)}
                  >
                    {facility.is_active ? "Switch off" : "Switch on"}
                  </button>
                </div>
              </div>

              <div style={statsRowStyle}>
                <span style={statStyle}>
                  <MapPin size={13} /> {facility.barangay_count} barangay(s) served
                </span>
                <span style={statStyle}>
                  <UsersIcon size={13} /> {facility.staff_count} staff assigned
                </span>
              </div>

              {editingBarangaysFor === facility.id ? (
                <div style={barangayPanelStyle}>
                  <p style={mutedTextStyle}>
                    Tick the barangays this RHU serves. More than one RHU can
                    serve the same barangay — ticking it here does not take it
                    away from another facility. That is what keeps a barangay
                    covered when one RHU is closed.
                  </p>

                  <div style={selectAllRowStyle}>
                    <button
                      type="button"
                      style={chipButtonStyle}
                      onClick={() =>
                        setSelectedBarangays(
                          new Set(barangays.map((item) => item.barangay_id))
                        )
                      }
                    >
                      Select all {barangays.length}
                    </button>

                    <button
                      type="button"
                      style={chipButtonStyle}
                      onClick={() => setSelectedBarangays(new Set())}
                    >
                      Clear all
                    </button>

                    <span style={selectAllCountStyle}>
                      {selectedBarangays.size} of {barangays.length} selected
                    </span>
                  </div>

                  <div style={barangayGridStyle}>
                    {barangays.map((barangay) => {
                      const checked = selectedBarangays.has(barangay.barangay_id);
                      /*
                       * Which facility a resident here is routed to by
                       * default. Coverage is shared; the home facility is
                       * not, and it is worth seeing while deciding.
                       */
                      const homeElsewhere =
                        barangay.rhu_id != null && barangay.rhu_id !== facility.id;

                      return (
                        <label key={barangay.barangay_id} style={barangayItemStyle(checked)}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              const next = new Set(selectedBarangays);

                              if (event.target.checked) {
                                next.add(barangay.barangay_id);
                              } else {
                                next.delete(barangay.barangay_id);
                              }

                              setSelectedBarangays(next);
                            }}
                          />
                          <span style={{ minWidth: 0 }}>
                            {barangay.name}
                            {homeElsewhere ? (
                              <small style={{ color: "#64748B", display: "block" }}>
                                home: RHU {barangay.rhu_id}
                              </small>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      style={primaryButton}
                      disabled={saving}
                      onClick={() => void saveBarangays(facility)}
                    >
                      <Check size={16} />
                      {saving ? "Saving…" : "Save barangays"}
                    </button>

                    <button
                      type="button"
                      style={secondaryButton}
                      onClick={() => setEditingBarangaysFor(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ── styles ───────────────────────────────────────────────────────────────────

const pageStyle: CSSProperties = { display: "grid", gap: 16, paddingBottom: 40 };

const heroStyle: CSSProperties = {
  background: "linear-gradient(135deg, #064E3B, #0F766E)",
  color: "#ECFDF5",
  borderRadius: 18,
  padding: "22px 24px",
  display: "grid",
  gap: 8,
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "#A7F3D0",
};

const titleStyle: CSSProperties = { margin: 0, fontSize: 28, fontWeight: 900 };

const heroTextStyle: CSSProperties = { margin: 0, maxWidth: 760, lineHeight: 1.55 };

const cardStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 18,
  display: "grid",
  gap: 12,
};

const listStyle: CSSProperties = { display: "grid", gap: 14 };

const facilityHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "flex-start",
};

const facilityIconStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  background: "#ECFDF5",
  color: "#0F766E",
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 17,
  fontWeight: 900,
  color: "#0F172A",
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const mutedTextStyle: CSSProperties = { margin: 0, color: "#64748B", fontSize: 13 };

const codePillStyle: CSSProperties = {
  background: "#F1F5F9",
  color: "#475569",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 11,
  fontWeight: 800,
};

const offPillStyle: CSSProperties = {
  background: "#FEF3C7",
  color: "#92400E",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 11,
  fontWeight: 800,
};

const warningPillStyle: CSSProperties = {
  background: "#FEF3C7",
  color: "#92400E",
  border: "1px solid #FDE68A",
  borderRadius: 999,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 800,
};

const statsRowStyle: CSSProperties = { display: "flex", gap: 14, flexWrap: "wrap" };

const statStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  fontWeight: 700,
  color: "#334155",
};

const barangayPanelStyle: CSSProperties = {
  borderTop: "1px solid #E5E7EB",
  paddingTop: 12,
  display: "grid",
  gap: 12,
};

const barangayGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
  gap: 8,
  maxHeight: 320,
  overflowY: "auto",
};

function barangayItemStyle(checked: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    border: `1px solid ${checked ? "#5EEAD4" : "#E5E7EB"}`,
    background: checked ? "#F0FDF9" : "#FFFFFF",
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 13,
    cursor: "pointer",
  };
}

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#64748B",
};

// Sits under the coordinate fields: the instruction is short enough to
// follow without leaving the page, which is the point of putting it here.
const selectAllRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 4,
};

const chipButtonStyle: CSSProperties = {
  padding: "7px 14px",
  borderRadius: 999,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F766E",
  fontSize: 12.5,
  fontWeight: 800,
  cursor: "pointer",
};

const selectAllCountStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: "#64748B",
};

const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.5,
  fontWeight: 600,
  color: "#64748B",
};

const inputStyle: CSSProperties = {
  height: 42,
  border: "1px solid #E5E7EB",
  borderRadius: 10,
  padding: "0 12px",
  fontSize: 14,
  color: "#0F172A",
};

const primaryButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: "none",
  background: "#0F766E",
  color: "#FFFFFF",
  borderRadius: 12,
  padding: "10px 16px",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
  justifySelf: "start",
};

const secondaryButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F766E",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
};

const dangerButton: CSSProperties = {
  ...secondaryButton,
  borderColor: "#FECACA",
  color: "#B91C1C",
};
