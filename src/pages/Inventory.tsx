// src/pages/Inventory.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { usePagination } from "../hooks/usePagination";
import TablePagination from "../components/ui/TablePagination";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { useAuthStore } from "../store/authStore";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarClock,
  CheckCircle,
  ClipboardList,
  Edit2,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";

import {
  addInventoryItem,
  adjustInventoryItem,
  deductInventoryItem,
  deleteInventoryItem,
  getInventory,
  getInventoryAlerts,
  getInventoryTransactions,
  getAssignedPersonnel,
  setAssignedPersonnel,
  getDefaultInventoryRhuId,
  restockItem,
  updateInventoryItem,
  type InventoryCategory,
  type InventoryItem,
  type InventoryStatus,
  type InventoryTab,
  type InventoryTransaction,
  type AssignedPersonnel,
  type EligiblePersonnel,
} from "../services/inventory";
import { useToast } from "../contexts/ToastContext";

type ItemFormState = {
  name: string;
  generic_name: string;
  category: InventoryCategory;
  display_category: string;
  unit: string;
  dosage_form: string;
  current_stock: string;
  minimum_stock_level: string;
  reorder_point: string;
  maximum_stock_level: string;
  expiration_date: string;
  is_controlled_substance: boolean;
  requires_prescription: boolean;
  notes: string;
};

type MovementMode = "stock_in" | "stock_out" | "adjust";

type MovementState = {
  mode: MovementMode;
  quantity: string;
  reason: string;
  reference_number: string;
  notes: string;
};

const emptyForm: ItemFormState = {
  name: "",
  generic_name: "",
  category: "medicine",
  display_category: "",
  unit: "pcs",
  dosage_form: "",
  current_stock: "0",
  minimum_stock_level: "10",
  reorder_point: "20",
  maximum_stock_level: "",
  expiration_date: "",
  is_controlled_substance: false,
  requires_prescription: false,
  notes: "",
};

const emptyMovement: MovementState = {
  mode: "stock_in",
  quantity: "",
  reason: "",
  reference_number: "",
  notes: "",
};

const categoryOptions: Array<{
  value: InventoryCategory;
  label: string;
  helper: string;
}> = [
  {
    value: "medicine",
    label: "Gamot",
    helper: "Tablets, capsules, syrup, drops",
  },
  {
    value: "vaccine",
    label: "Bakuna",
    helper: "Immunization and vaccine stocks",
  },
  {
    value: "supply",
    label: "Supplies",
    helper: "Syringe, gloves, mask, cotton",
  },
  {
    value: "equipment",
    label: "Equipment",
    helper: "Reusable RHU equipment",
  },
];

function numberValue(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function categoryLabel(category: InventoryCategory): string {
  switch (category) {
    case "vaccine":
      return "Bakuna";
    case "supply":
      return "Supply";
    case "equipment":
      return "Equipment";
    default:
      return "Gamot";
  }
}

function statusUi(status: InventoryStatus): {
  label: string;
  icon: string;
  bg: string;
  color: string;
  border: string;
} {
  switch (status) {
    case "out":
      return {
        label: "Walang Stock",
        icon: "✕",
        bg: "#FEF2F2",
        color: "#B91C1C",
        border: "#FECACA",
      };
    case "expired":
      return {
        label: "Expired",
        icon: "!",
        bg: "#FFF1F2",
        color: "#BE123C",
        border: "#FECDD3",
      };
    case "expiring":
      return {
        label: "Malapit Mag-expire",
        icon: "⏰",
        bg: "#FFF7ED",
        color: "#C2410C",
        border: "#FED7AA",
      };
    case "low":
      return {
        label: "Mababang Stock",
        icon: "!",
        bg: "#FFFBEB",
        color: "#B45309",
        border: "#FDE68A",
      };
    default:
      return {
        label: "Maayos",
        icon: "✓",
        bg: "#ECFDF5",
        color: "#047857",
        border: "#A7F3D0",
      };
  }
}

function getErrorMessage(error: any, fallback: string): string {
  const validationErrors = error?.response?.data?.errors;

  if (validationErrors) {
    return Object.values(validationErrors).flat().join("\n");
  }

  return error?.response?.data?.message || error?.message || fallback;
}

export default function Inventory() {
  const toast = useToast();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [alertsCount, setAlertsCount] = useState({
    low: 0,
    out: 0,
    expiring: 0,
  });

  const [tab, setTab] = useState<InventoryTab>("all");
  const [search, setSearch] = useState("");

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [transactionsModalOpen, setTransactionsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Part 2(a) — formally assigned inventory personnel for THIS RHU. Display /
  // accountability only: it never blocks anyone from moving stock.
  const authUser = useAuthStore((state) => state.user);
  const canAssignPersonnel = ["super_admin", "superadmin", "mho"].includes(
    String((authUser as any)?.role ?? "").toLowerCase()
  );
  const [assigned, setAssigned] = useState<AssignedPersonnel | null>(null);
  const [eligible, setEligible] = useState<EligiblePersonnel[]>([]);
  const [assigningPersonnel, setAssigningPersonnel] = useState(false);

  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const [form, setForm] = useState<ItemFormState>(emptyForm);
  const [movement, setMovement] = useState<MovementState>(emptyMovement);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const loadAssignedPersonnel = useCallback(async () => {
    try {
      const { assigned: row, eligible: options } = await getAssignedPersonnel(
        getDefaultInventoryRhuId()
      );
      setAssigned(row);
      setEligible(options);
    } catch {
      // Supplementary accountability info — never block the inventory page.
    }
  }, []);

  async function changeAssignedPersonnel(userId: number | null) {
    setAssigningPersonnel(true);

    try {
      const row = await setAssignedPersonnel(getDefaultInventoryRhuId(), userId);
      setAssigned(row);
      flash(
        row?.name
          ? `${row.name} is now the assigned inventory personnel.`
          : "Assigned inventory personnel cleared."
      );
      // Re-read history so the assigned/not-assigned badges reflect the change.
      if (transactionsModalOpen && selectedItem) {
        setTransactions(await getInventoryTransactions(selectedItem.id));
      }
    } catch (err: any) {
      toast.error(getErrorMessage(err, "Could not update assigned personnel."));
    } finally {
      setAssigningPersonnel(false);
    }
  }

  const loadInventory = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);

      setError("");

      try {
        const apiType =
          tab === "medicine" ||
          tab === "vaccine" ||
          tab === "supply" ||
          tab === "equipment"
            ? tab
            : "all";

        const data = await getInventory({
          type: apiType,
          search: search.trim() || undefined,
        });

        setItems(data);

        try {
          const alerts = await getInventoryAlerts();

          setAlertsCount({
            low: alerts.low_stock.length,
            out: alerts.out_of_stock.length,
            expiring: alerts.expiring_soon.length,
          });
        } catch {
          setAlertsCount({
            low: data.filter((item) => item.status === "low").length,
            out: data.filter((item) => item.status === "out").length,
            expiring: data.filter((item) => item.status === "expiring").length,
          });
        }
      } catch (err: any) {
        setError(getErrorMessage(err, "Could not load inventory."));
      } finally {
        setLoading(false);
      }
    },
    [search, tab]
  );

  useEffect(() => {
    void loadAssignedPersonnel();
  }, [loadAssignedPersonnel]);

  useEffect(() => {
    loadInventory();

    const timer = window.setInterval(() => {
      loadInventory(true);
    }, 15000);

    return () => window.clearInterval(timer);
  }, [loadInventory]);

  const filteredItems = useMemo<InventoryItem[]>(() => {
    const keyword = search.trim().toLowerCase();

    return items.filter((item: InventoryItem) => {
      if (tab === "medicine" && item.category !== "medicine") return false;
      if (tab === "vaccine" && item.category !== "vaccine") return false;
      if (tab === "supply" && item.category !== "supply") return false;
      if (tab === "equipment" && item.category !== "equipment") return false;
      if (tab === "low" && item.status !== "low") return false;
      if (tab === "out" && item.status !== "out") return false;
      if (tab === "expiring" && item.status !== "expiring") return false;
      if (tab === "expired" && item.status !== "expired") return false;

      if (!keyword) return true;

      return [
        item.name,
        item.generic_name,
        item.item_code,
        item.category,
        item.display_category,
        item.unit,
        item.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [items, search, tab]);

  // Part 8 — paginate the already-filtered inventory list.
  const pg = usePagination(filteredItems, { resetDeps: [filteredItems] });

  const stats = useMemo(() => {
    return {
      total: items.length,
      medicines: items.filter((item) => item.category === "medicine").length,
      vaccines: items.filter((item) => item.category === "vaccine").length,
      low: items.filter((item) => item.status === "low").length,
      out: items.filter((item) => item.status === "out").length,
      expiring: items.filter((item) => item.status === "expiring").length,
      expired: items.filter((item) => item.status === "expired").length,
    };
  }, [items]);

  const highestRiskItem = useMemo(() => {
    return (
      items.find((item) => item.status === "out") ||
      items.find((item) => item.status === "expired") ||
      items.find((item) => item.status === "low") ||
      items.find((item) => item.status === "expiring") ||
      null
    );
  }, [items]);

  function flash(message: string) {
    setSuccess(message);

    window.setTimeout(() => {
      setSuccess("");
    }, 3200);
  }

  function openAddModal() {
    setEditItem(null);
    setForm(emptyForm);
    setItemModalOpen(true);
  }

  function openEditModal(item: InventoryItem) {
    setEditItem(item);

    setForm({
      name: item.name,
      generic_name: item.generic_name ?? "",
      category: item.category,
      display_category: item.display_category || categoryLabel(item.category),
      unit: item.unit,
      dosage_form: item.dosage_form ?? "",
      current_stock: String(item.current_stock),
      minimum_stock_level: String(item.minimum_stock_level),
      reorder_point: String(item.reorder_point),
      maximum_stock_level:
        item.maximum_stock_level === null || item.maximum_stock_level === undefined
          ? ""
          : String(item.maximum_stock_level),
      expiration_date: item.expiration_date?.slice(0, 10) ?? "",
      is_controlled_substance: item.is_controlled_substance,
      requires_prescription: item.requires_prescription,
      notes: item.notes ?? "",
    });

    setItemModalOpen(true);
  }

  function openMovementModal(item: InventoryItem, mode: MovementMode) {
    setSelectedItem(item);

    setMovement({
      mode,
      quantity: mode === "adjust" ? String(item.current_stock) : "",
      reason:
        mode === "stock_in"
          ? "Manual restock from RHU inventory."
          : mode === "stock_out"
            ? `Manual stock deduction for ${item.name}.`
            : `Inventory adjustment for ${item.name}.`,
      reference_number: "",
      notes: "",
    });

    setMovementModalOpen(true);
  }

  async function openTransactionsModal(item: InventoryItem) {
    setSelectedItem(item);
    setTransactionsModalOpen(true);
    setTransactions([]);

    try {
      const data = await getInventoryTransactions(item.id);
      setTransactions(data);
    } catch (err: any) {
      setTransactions(item.transactions ?? []);
      setError(getErrorMessage(err, "Could not load transaction history."));
    }
  }

  function validateItemForm(): string | null {
    if (!form.name.trim()) {
      return "Item name is required.";
    }

    if (numberValue(form.current_stock) < 0) {
      return "Current stock cannot be negative.";
    }

    if (numberValue(form.minimum_stock_level) < 0) {
      return "Minimum stock level cannot be negative.";
    }

    if (numberValue(form.reorder_point) < 0) {
      return "Reorder point cannot be negative.";
    }

    if (
      form.maximum_stock_level &&
      numberValue(form.maximum_stock_level) < numberValue(form.current_stock)
    ) {
      return "Maximum stock should not be lower than the current stock.";
    }

    return null;
  }

  async function saveItem() {
    const validation = validateItemForm();

    if (validation) {
      toast.warning(validation);
      return;
    }

    setSaving(true);

    const payload = {
      name: form.name.trim(),
      generic_name: form.generic_name.trim() || null,
      category: form.category,
      display_category: form.display_category.trim() || categoryLabel(form.category),
      unit_of_measure: form.unit.trim() || "pcs",
      dosage_form: form.dosage_form.trim() || null,
      current_stock: numberValue(form.current_stock),
      minimum_stock_level: numberValue(form.minimum_stock_level),
      reorder_point: numberValue(form.reorder_point),
      maximum_stock_level: form.maximum_stock_level
        ? numberValue(form.maximum_stock_level)
        : null,
      expiration_date: form.expiration_date || null,
      is_controlled_substance: form.is_controlled_substance,
      requires_prescription: form.requires_prescription,
      notes: form.notes.trim() || null,
    };

    try {
      if (editItem) {
        await updateInventoryItem(editItem.id, payload);
        flash("Inventory item updated.");
      } else {
        await addInventoryItem(payload);
        flash("New inventory item added.");
      }

      setItemModalOpen(false);
      setEditItem(null);
      await loadInventory(true);
    } catch (err: any) {
      toast.error(getErrorMessage(err, "Could not save inventory item."));
    } finally {
      setSaving(false);
    }
  }

  async function saveMovement() {
    if (!selectedItem) return;

    const quantity = numberValue(movement.quantity);

    if (movement.mode !== "adjust" && quantity <= 0) {
      toast.warning("Quantity must be greater than zero.");
      return;
    }

    if (movement.mode === "adjust" && quantity < 0) {
      toast.warning("New quantity cannot be negative.");
      return;
    }

    if (
      movement.mode === "stock_out" &&
      quantity > selectedItem.current_stock
    ) {
      toast.warning(
        `Cannot deduct more than available stock. Available: ${selectedItem.current_stock}.`
      );
      return;
    }

    if (
      (movement.mode === "stock_out" || movement.mode === "adjust") &&
      movement.reason.trim().length < 10
    ) {
      toast.warning("Please enter a clear reason. Minimum 10 characters.");
      return;
    }

    setSaving(true);

    try {
      if (movement.mode === "stock_in") {
        await restockItem(selectedItem.id, quantity, {
          reference_number: movement.reference_number.trim() || undefined,
          // Optional for a restock, but when staff DO type a reason it must
          // reach the ledger instead of being dropped on the floor.
          reason: movement.reason.trim() || undefined,
          notes: movement.notes.trim() || "Manual restock from RHU inventory.",
        });

        flash("Stock added successfully.");
      }

      if (movement.mode === "stock_out") {
        await deductInventoryItem(
          selectedItem.id,
          quantity,
          movement.reason.trim(),
          movement.notes.trim() || movement.reason.trim()
        );

        flash("Stock deducted successfully.");
      }

      if (movement.mode === "adjust") {
        await adjustInventoryItem(
          selectedItem.id,
          quantity,
          movement.reason.trim()
        );

        flash("Stock adjusted successfully.");
      }

      setMovementModalOpen(false);
      setSelectedItem(null);
      await loadInventory(true);
    } catch (err: any) {
      toast.error(getErrorMessage(err, "Could not save stock movement."));
    } finally {
      setSaving(false);
    }
  }

  // Deleting is gated behind a type-to-confirm modal instead of window.confirm.
  // A native confirm cannot host inputs, so it could capture neither the typed
  // item name nor the reason the audit trail stores — every delete used to send
  // the same hardcoded placeholder reason.
  function removeItem(item: InventoryItem) {
    setDeleteTarget(item);
  }

  async function confirmRemoveItem(reason: string) {
    if (!deleteTarget) return;

    setDeleting(true);

    try {
      await deleteInventoryItem(deleteTarget.id, reason);
      setDeleteTarget(null);
      flash("Inventory item removed.");
      await loadInventory(true);
    } catch (err: any) {
      toast.error(getErrorMessage(err, "Could not remove inventory item."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <section style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>Ka-Agapay RHU Inventory</div>

          <h1 style={heroTitleStyle}>Pamamahala ng Imbentaryo</h1>

          <p style={heroTextStyle}>
            Real-time na pagbabantay ng gamot, bakuna, supplies, at equipment.
            Designed para madaling makita kung ano ang kailangang i-restock,
            bawal gamitin, malapit mag-expire, o ligtas gamitin.
          </p>

          <div style={heroHintStyle}>
            <ShieldAlert size={17} />
            Real-life rule: FEFO — first expiry, first out. Expired items should
            not be dispensed.
          </div>
        </div>

        <div style={heroActionsStyle}>
          <button
            type="button"
            onClick={() => loadInventory()}
            disabled={loading}
            style={heroButtonStyle}
          >
            <RefreshCw size={17} />
            {loading ? "Loading..." : "I-refresh"}
          </button>

          <button type="button" onClick={openAddModal} style={heroButtonStyle}>
            <Plus size={17} />
            Magdagdag ng Item
          </button>
        </div>
      </section>

      {success && (
        <div style={successStyle}>
          <CheckCircle size={18} />
          {success}
        </div>
      )}

      {error && (
        <div style={errorStyle}>
          <AlertTriangle size={18} />
          <span style={{ whiteSpace: "pre-line" }}>{error}</span>
        </div>
      )}

      <section style={statsGridStyle}>
        <StatCard
          label="Kabuuang Item"
          value={stats.total}
          icon={<Package size={24} />}
          helper="All active stocks"
          tone="green"
          onClick={() => setTab("all")}
        />

        <StatCard
          label="Mababang Stock"
          value={stats.low}
          icon={<AlertTriangle size={24} />}
          helper={`${alertsCount.low || stats.low} item(s) need reorder`}
          tone="amber"
          onClick={() => setTab("low")}
        />

        <StatCard
          label="Walang Stock"
          value={stats.out}
          icon={<ShieldAlert size={24} />}
          helper={`${alertsCount.out || stats.out} unavailable item(s)`}
          tone="red"
          onClick={() => setTab("out")}
        />

        <StatCard
          label="Malapit Mag-expire"
          value={stats.expiring}
          icon={<CalendarClock size={24} />}
          helper={`${alertsCount.expiring || stats.expiring} item(s) within 30 days`}
          tone="violet"
          onClick={() => setTab("expiring")}
        />
      </section>

      <section style={actionCenterStyle}>
        <div>
          <h2 style={sectionTitleStyle}>Real-life Safety Guide</h2>

          <p style={mutedTextStyle}>
            Para hindi malito ang RHU staff: ito ang pinaka-importanteng
            aksyon ngayon.
          </p>
        </div>

        <div style={guideBoxStyle}>
          {highestRiskItem ? (
            <>
              <strong>{highestRiskItem.name}</strong>
              <span>
                {highestRiskItem.safety_message} Recommended action:{" "}
                {highestRiskItem.recommended_action}
              </span>
            </>
          ) : (
            <>
              <strong>No critical inventory warning right now.</strong>
              <span>Continue normal monitoring and weekly stock audit.</span>
            </>
          )}
        </div>
      </section>

      {/*
        Part 2(a) — who is FORMALLY responsible for inventory at this RHU.
        Everyone sees the designation; only Super Admin / MHO can change it
        (the backend enforces that too). This designates responsibility; it does
        NOT restrict who may move stock.
      */}
      <section style={personnelCardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <ClipboardList size={18} style={{ color: "#0F766E", flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#0F766E" }}>
              Assigned Inventory Personnel
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>
              {assigned?.name ?? "Not yet designated"}
            </div>
            <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.45 }}>
              {assigned?.name
                ? "Stock movements by anyone else are flagged in Stock Movement History."
                : "Designate someone to start cross-checking who performs stock movements."}
            </div>
          </div>
        </div>

        {canAssignPersonnel ? (
          <select
            value={assigned?.user_id ? String(assigned.user_id) : ""}
            disabled={assigningPersonnel}
            onChange={(event) =>
              changeAssignedPersonnel(
                event.target.value ? Number(event.target.value) : null
              )
            }
            style={personnelSelectStyle}
          >
            <option value="">— No one assigned —</option>
            {eligible.map((person) => (
              <option key={person.user_id} value={person.user_id}>
                {person.name}
              </option>
            ))}
          </select>
        ) : null}
      </section>

      <section style={toolbarStyle}>
        <div style={tabWrapStyle}>
          <TabButton active={tab === "all"} onClick={() => setTab("all")}>
            Lahat
          </TabButton>

          <TabButton active={tab === "medicine"} onClick={() => setTab("medicine")}>
            Mga Gamot
          </TabButton>

          <TabButton active={tab === "vaccine"} onClick={() => setTab("vaccine")}>
            Mga Bakuna
          </TabButton>

          <TabButton active={tab === "supply"} onClick={() => setTab("supply")}>
            Supplies
          </TabButton>

          <TabButton active={tab === "equipment"} onClick={() => setTab("equipment")}>
            Equipment
          </TabButton>

          <TabButton active={tab === "expired"} onClick={() => setTab("expired")}>
            Expired
          </TabButton>
        </div>

        <div style={searchBoxStyle}>
          <Search size={17} color="#64748B" />

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Maghanap ng item, generic name, code..."
            style={searchInputStyle}
          />
        </div>
      </section>

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Inventory List</h2>
            <p style={mutedTextStyle}>
              Gamitin ang malalaking button para sa common actions:
              Restock, Deduct, Adjust, Edit, History.
            </p>
          </div>

          <div style={{ color: "#64748B", fontWeight: 900 }}>
            Showing {filteredItems.length} of {items.length}
          </div>
        </div>

        {loading ? (
          <div style={emptyStyle}>Loading inventory...</div>
        ) : pg.total === 0 ? (
          <div style={emptyStyle}>
            Walang inventory item sa napiling filter. Try another tab or add a
            new item.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Item</th>
                  <th style={thStyle}>Uri</th>
                  <th style={thStyle}>Stock</th>
                  <th style={thStyle}>Expiry</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Recommended Action</th>
                  <th style={thStyle}>Mga Aksyon</th>
                </tr>
              </thead>

              <tbody>
                {pg.pageRows.map((item) => {
                  const status = statusUi(item.status);

                  return (
                    <tr key={item.id}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 950, color: "#0F172A" }}>
                          {item.name}
                        </div>

                        <div style={subTextStyle}>
                          {item.generic_name || "No generic name"}
                        </div>

                        <div style={codeStyle}>
                          {item.item_code || `ITEM-${item.id}`}
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div style={{ fontWeight: 900 }}>
                          {categoryLabel(item.category)}
                        </div>

                        <div style={subTextStyle}>
                          {item.display_category}
                          {item.dosage_form ? ` • ${item.dosage_form}` : ""}
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div
                          style={{
                            fontSize: 24,
                            fontWeight: 950,
                            color:
                              item.status === "out" ? "#B91C1C" : "#0F172A",
                          }}
                        >
                          {item.current_stock}
                        </div>

                        <div style={subTextStyle}>
                          {item.unit} • Reorder at {item.reorder_point}
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div style={{ fontWeight: 850 }}>
                          {formatDate(item.expiration_date)}
                        </div>

                        <div style={subTextStyle}>
                          {item.days_to_expiry === null
                            ? "No expiry"
                            : item.days_to_expiry < 0
                              ? `${Math.abs(item.days_to_expiry)} day(s) expired`
                              : `${item.days_to_expiry} day(s) left`}
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <span
                          style={{
                            ...badgeStyle,
                            color: status.color,
                            background: status.bg,
                            borderColor: status.border,
                          }}
                        >
                          {status.icon} {status.label}
                        </span>

                        {(item.is_controlled_substance ||
                          item.requires_prescription) && (
                          <div style={{ marginTop: 8 }}>
                            <span style={controlledBadgeStyle}>
                              Controlled / Rx
                            </span>
                          </div>
                        )}
                      </td>

                      <td style={tdStyle}>
                        <div style={{ maxWidth: 260 }}>
                          <strong>{item.safety_message}</strong>

                          <p style={{ ...subTextStyle, marginTop: 5 }}>
                            {item.recommended_action}
                          </p>
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div style={actionButtonWrapStyle}>
                          <button
                            type="button"
                            style={smallGreenButtonStyle}
                            onClick={() => openMovementModal(item, "stock_in")}
                          >
                            <ArrowUpCircle size={14} />
                            Restock
                          </button>

                          <button
                            type="button"
                            style={smallAmberButtonStyle}
                            onClick={() => openMovementModal(item, "stock_out")}
                            disabled={item.current_stock <= 0}
                          >
                            <ArrowDownCircle size={14} />
                            Deduct
                          </button>

                          <button
                            type="button"
                            style={smallButtonStyle}
                            onClick={() => openMovementModal(item, "adjust")}
                          >
                            <RotateCcw size={14} />
                            Adjust
                          </button>

                          <button
                            type="button"
                            style={smallButtonStyle}
                            onClick={() => openEditModal(item)}
                          >
                            <Edit2 size={14} />
                            Edit
                          </button>

                          <button
                            type="button"
                            style={smallButtonStyle}
                            onClick={() => openTransactionsModal(item)}
                          >
                            <ClipboardList size={14} />
                            History
                          </button>

                          <button
                            type="button"
                            style={smallDangerButtonStyle}
                            onClick={() => removeItem(item)}
                          >
                            <Trash2 size={14} />
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && pg.total > 0 ? (
          <TablePagination
            page={pg.page}
            pageCount={pg.pageCount}
            total={pg.total}
            from={pg.from}
            to={pg.to}
            pageSize={pg.pageSize}
            onPage={pg.setPage}
            onPageSize={pg.setPageSize}
            label="items"
          />
        ) : null}
      </section>

      {itemModalOpen && (
        <Modal
          title={editItem ? "I-edit ang Inventory Item" : "Magdagdag ng Item"}
          subtitle="Gamitin ang simple fields para maiwasan ang maling stock data."
          onClose={() => setItemModalOpen(false)}
        >
          <div style={formGridStyle}>
            <Field
              label="Item name"
              value={form.name}
              onChange={(value) => setForm({ ...form, name: value })}
              placeholder="Example: Paracetamol"
              required
            />

            <Field
              label="Generic name"
              value={form.generic_name}
              onChange={(value) => setForm({ ...form, generic_name: value })}
              placeholder="Example: Acetaminophen"
            />

            <SelectField
              label="Main category"
              value={form.category}
              onChange={(value) =>
                setForm({
                  ...form,
                  category: value as InventoryCategory,
                  display_category:
                    form.display_category || categoryLabel(value as InventoryCategory),
                })
              }
              options={categoryOptions.map((option) => ({
                value: option.value,
                label: `${option.label} — ${option.helper}`,
              }))}
            />

            <Field
              label="Display category"
              value={form.display_category}
              onChange={(value) =>
                setForm({ ...form, display_category: value })
              }
              placeholder="Example: Analgesic, Antibiotic, PPE"
            />

            <Field
              label="Current stock"
              type="number"
              value={form.current_stock}
              onChange={(value) =>
                setForm({ ...form, current_stock: value })
              }
              required
            />

            <Field
              label="Unit"
              value={form.unit}
              onChange={(value) => setForm({ ...form, unit: value })}
              placeholder="pcs, tabs, vial, bottle"
              required
            />

            <Field
              label="Minimum stock level"
              type="number"
              value={form.minimum_stock_level}
              onChange={(value) =>
                setForm({ ...form, minimum_stock_level: value })
              }
              required
            />

            <Field
              label="Reorder point"
              type="number"
              value={form.reorder_point}
              onChange={(value) =>
                setForm({ ...form, reorder_point: value })
              }
            />

            <Field
              label="Maximum stock level"
              type="number"
              value={form.maximum_stock_level}
              onChange={(value) =>
                setForm({ ...form, maximum_stock_level: value })
              }
              placeholder="Optional"
            />

            <Field
              label="Expiration date"
              type="date"
              value={form.expiration_date}
              onChange={(value) =>
                setForm({ ...form, expiration_date: value })
              }
            />

            <Field
              label="Dosage form"
              value={form.dosage_form}
              onChange={(value) =>
                setForm({ ...form, dosage_form: value })
              }
              placeholder="Tablet, capsule, syrup, injection"
            />

            <Field
              label="Notes"
              value={form.notes}
              onChange={(value) => setForm({ ...form, notes: value })}
              placeholder="Supplier, batch notes, storage reminders"
            />

            <label style={checkRowStyle}>
              <input
                type="checkbox"
                checked={form.requires_prescription}
                onChange={(event) =>
                  setForm({
                    ...form,
                    requires_prescription: event.target.checked,
                  })
                }
              />
              Requires prescription
            </label>

            <label style={checkRowStyle}>
              <input
                type="checkbox"
                checked={form.is_controlled_substance}
                onChange={(event) =>
                  setForm({
                    ...form,
                    is_controlled_substance: event.target.checked,
                  })
                }
              />
              Controlled substance
            </label>
          </div>

          <div style={modalFooterStyle}>
            <button
              type="button"
              style={outlineButtonStyle}
              onClick={() => setItemModalOpen(false)}
            >
              Cancel
            </button>

            <button
              type="button"
              style={primaryButtonStyle}
              onClick={saveItem}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Item"}
            </button>
          </div>
        </Modal>
      )}

      {movementModalOpen && selectedItem && (
        <Modal
          title={
            movement.mode === "stock_in"
              ? "Restock Item"
              : movement.mode === "stock_out"
                ? "Deduct Stock"
                : "Adjust Actual Stock"
          }
          subtitle={`${selectedItem.name} • Current stock: ${selectedItem.current_stock} ${selectedItem.unit}`}
          onClose={() => setMovementModalOpen(false)}
        >
          <div style={warningMiniStyle}>
            <AlertTriangle size={18} />
            <div>
              <strong>Inventory safety reminder</strong>
              <p style={{ margin: "4px 0 0" }}>
                Deduct only when medicine was dispensed, damaged, transferred,
                or removed with a valid reason.
              </p>
            </div>
          </div>

          <div style={formGridStyle}>
            <Field
              label={
                movement.mode === "adjust"
                  ? "New actual quantity"
                  : "Quantity"
              }
              type="number"
              value={movement.quantity}
              onChange={(value) =>
                setMovement({ ...movement, quantity: value })
              }
              required
            />

            {movement.mode === "stock_in" && (
              <Field
                label="Reference number"
                value={movement.reference_number}
                onChange={(value) =>
                  setMovement({ ...movement, reference_number: value })
                }
                placeholder="Delivery receipt / batch ref"
              />
            )}

            <Field
              label="Reason"
              value={movement.reason}
              onChange={(value) =>
                setMovement({ ...movement, reason: value })
              }
              placeholder="Explain why stock changed"
              required={movement.mode !== "stock_in"}
            />

            <Field
              label="Notes"
              value={movement.notes}
              onChange={(value) =>
                setMovement({ ...movement, notes: value })
              }
              placeholder="Optional extra details"
            />
          </div>

          <div style={modalFooterStyle}>
            <button
              type="button"
              style={outlineButtonStyle}
              onClick={() => setMovementModalOpen(false)}
            >
              Cancel
            </button>

            <button
              type="button"
              style={
                movement.mode === "stock_out"
                  ? dangerPrimaryButtonStyle
                  : primaryButtonStyle
              }
              onClick={saveMovement}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Stock Movement"}
            </button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remove inventory item"
        tone="danger"
        confirmLabel="Delete item"
        busy={deleting}
        matchText={deleteTarget?.name ?? ""}
        requireReason
        minReasonLength={10}
        reasonLabel="Reason for removal"
        reasonPlaceholder="e.g. Expired stock removed from circulation"
        message={
          <>
            This removes <strong>{deleteTarget?.name}</strong>
            {deleteTarget?.item_code ? ` (${deleteTarget.item_code})` : ""} from
            active inventory. It stays restorable from Delete &amp; Archive
            History for 30 days, and the stock movement audit trail is kept.
          </>
        }
        onConfirm={confirmRemoveItem}
        onCancel={() => setDeleteTarget(null)}
      />

      {transactionsModalOpen && selectedItem && (
        <Modal
          title="Stock Movement History"
          subtitle={`${selectedItem.name} • Audit trail`}
          onClose={() => setTransactionsModalOpen(false)}
        >
          {transactions.length === 0 ? (
            <div style={emptyStyle}>No transaction history found.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {transactions.map((tx) => (
                <div key={tx.id} style={historyCardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <strong>
                      {tx.transaction_type || "movement"}{" "}
                      {tx.quantity_changed !== null &&
                      tx.quantity_changed !== undefined
                        ? `(${tx.quantity_changed > 0 ? "+" : ""}${tx.quantity_changed})`
                        : ""}
                    </strong>

                    <span style={subTextStyle}>
                      {formatDateTime(tx.created_at)}
                    </span>
                  </div>

                  <div style={subTextStyle}>
                    Before: {tx.quantity_before ?? "—"} • After:{" "}
                    {tx.quantity_after ?? "—"}
                  </div>

                  <div style={subTextStyle}>
                    By: {tx.performed_by_name || "Unknown staff"}
                    {tx.reference_number ? ` • Ref: ${tx.reference_number}` : ""}
                  </div>

                  {/*
                    Cross-reference against the RHU's assigned personnel.
                    Undefined/null = nobody is designated, so there is nothing to
                    compare — deliberately NOT rendered as a warning.
                  */}
                  {tx.performed_by_assigned === true ? (
                    <div style={assignedOkBadgeStyle}>
                      <CheckCircle size={13} />
                      Assigned inventory personnel
                    </div>
                  ) : tx.performed_by_assigned === false ? (
                    <div style={assignedWarnBadgeStyle}>
                      <AlertTriangle size={13} />
                      Not the assigned inventory personnel
                      {tx.assigned_personnel_name
                        ? ` (assigned: ${tx.assigned_personnel_name})`
                        : ""}
                    </div>
                  ) : null}

                  <p style={{ margin: "6px 0 0", color: "#334155" }}>
                    {tx.reason || tx.notes || "No reason recorded."}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  helper,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  helper: string;
  tone: "green" | "amber" | "red" | "violet";
  onClick: () => void;
}) {
  const colorMap = {
    green: {
      bg: "#ECFDF5",
      color: "#047857",
      border: "#A7F3D0",
    },
    amber: {
      bg: "#FFFBEB",
      color: "#B45309",
      border: "#FDE68A",
    },
    red: {
      bg: "#FEF2F2",
      color: "#B91C1C",
      border: "#FECACA",
    },
    violet: {
      bg: "#F5F3FF",
      color: "#6D28D9",
      border: "#DDD6FE",
    },
  }[tone];

  return (
    <button type="button" onClick={onClick} style={statCardStyle}>
      <div
        style={{
          width: 50,
          height: 50,
          borderRadius: 16,
          background: colorMap.bg,
          color: colorMap.color,
          border: `1px solid ${colorMap.border}`,
          display: "grid",
          placeItems: "center",
        }}
      >
        {icon}
      </div>

      <div>
        <div style={{ color: "#64748B", fontSize: 13, fontWeight: 900 }}>
          {label}
        </div>

        <div style={{ color: "#0F172A", fontSize: 30, fontWeight: 950 }}>
          {value}
        </div>

        <div style={{ color: "#94A3B8", fontSize: 12 }}>{helper}</div>
      </div>
    </button>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: active ? "1px solid #0F766E" : "1px solid #E2E8F0",
        background: active ? "#0F766E" : "#FFFFFF",
        color: active ? "#FFFFFF" : "#334155",
        borderRadius: 999,
        padding: "11px 16px",
        fontWeight: 950,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={modalHeaderStyle}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, color: "#0F172A" }}>
              {title}
            </h2>

            {subtitle && <p style={mutedTextStyle}>{subtitle}</p>}
          </div>

          <button type="button" onClick={onClose} style={iconButtonStyle}>
            <X size={20} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label style={{ display: "grid", gap: 7 }}>
      <span style={labelStyle}>
        {label} {required && <b style={{ color: "#DC2626" }}>*</b>}
      </span>

      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label style={{ display: "grid", gap: 7 }}>
      <span style={labelStyle}>{label}</span>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const heroStyle: CSSProperties = {
  background: "linear-gradient(135deg, #064E3B 0%, #0F766E 55%, #5EEAD4 100%)",
  color: "white",
  borderRadius: 26,
  padding: 30,
  display: "flex",
  justifyContent: "space-between",
  gap: 18,
  flexWrap: "wrap",
  alignItems: "end",
  boxShadow: "0 22px 55px rgba(15,118,110,.22)",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 12,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  fontWeight: 950,
  color: "rgba(255,255,255,.8)",
};

const heroTitleStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 38,
  lineHeight: 1.05,
  fontWeight: 950,
};

const heroTextStyle: CSSProperties = {
  margin: "12px 0 0",
  maxWidth: 850,
  lineHeight: 1.7,
  color: "rgba(255,255,255,.93)",
};

const heroHintStyle: CSSProperties = {
  marginTop: 14,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: "rgba(255,255,255,.16)",
  border: "1px solid rgba(255,255,255,.28)",
  borderRadius: 999,
  padding: "9px 12px",
  fontWeight: 850,
};

const heroActionsStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const heroButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,.45)",
  background: "rgba(255,255,255,.16)",
  color: "white",
  borderRadius: 14,
  padding: "13px 16px",
  fontFamily: "inherit",
  fontWeight: 950,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
};

const statsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 14,
};

const statCardStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 20,
  padding: 18,
  boxShadow: "0 12px 30px rgba(15,23,42,.05)",
  display: "flex",
  gap: 14,
  textAlign: "left",
  cursor: "pointer",
  fontFamily: "inherit",
};

const cardStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 22,
  padding: 20,
  boxShadow: "0 14px 36px rgba(15,23,42,.06)",
};

const actionCenterStyle: CSSProperties = {
  ...cardStyle,
  display: "grid",
  gridTemplateColumns: "minmax(220px, 320px) 1fr",
  gap: 16,
};

const guideBoxStyle: CSSProperties = {
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 18,
  padding: 16,
  display: "grid",
  gap: 6,
  color: "#334155",
};

const toolbarStyle: CSSProperties = {
  ...cardStyle,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap",
};

const tabWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const searchBoxStyle: CSSProperties = {
  flex: "1 1 320px",
  maxWidth: 480,
  display: "flex",
  alignItems: "center",
  gap: 9,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 14,
  padding: "0 12px",
};

const searchInputStyle: CSSProperties = {
  width: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  padding: "13px 0",
  fontFamily: "inherit",
  fontSize: 14,
};

const successStyle: CSSProperties = {
  background: "#ECFDF5",
  border: "1px solid #A7F3D0",
  color: "#065F46",
  borderRadius: 16,
  padding: 14,
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontWeight: 900,
};

const errorStyle: CSSProperties = {
  background: "#FEF2F2",
  border: "1px solid #FCA5A5",
  color: "#991B1B",
  borderRadius: 16,
  padding: 14,
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  fontWeight: 900,
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "start",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0F172A",
  fontSize: 20,
  fontWeight: 950,
};

const mutedTextStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#64748B",
  lineHeight: 1.6,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1100,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "12px 10px",
  color: "#64748B",
  fontSize: 12,
  borderBottom: "1px solid #E5E7EB",
  whiteSpace: "nowrap",
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const tdStyle: CSSProperties = {
  padding: "14px 10px",
  color: "#0F172A",
  borderBottom: "1px solid #F1F5F9",
  fontSize: 13,
  verticalAlign: "top",
};

const subTextStyle: CSSProperties = {
  color: "#64748B",
  fontSize: 12,
  lineHeight: 1.45,
};

const codeStyle: CSSProperties = {
  display: "inline-block",
  marginTop: 6,
  color: "#0F766E",
  background: "#ECFDF5",
  border: "1px solid #A7F3D0",
  borderRadius: 999,
  padding: "3px 8px",
  fontSize: 11,
  fontWeight: 900,
};

const badgeStyle: CSSProperties = {
  border: "1px solid",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 950,
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
};

const controlledBadgeStyle: CSSProperties = {
  background: "#EEF2FF",
  border: "1px solid #C7D2FE",
  color: "#3730A3",
  borderRadius: 999,
  padding: "5px 9px",
  fontSize: 11,
  fontWeight: 900,
};

const actionButtonWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 7,
  minWidth: 290,
};

const smallButtonBase: CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#334155",
  borderRadius: 11,
  padding: "8px 10px",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const smallButtonStyle: CSSProperties = {
  ...smallButtonBase,
};

const smallGreenButtonStyle: CSSProperties = {
  ...smallButtonBase,
  background: "#ECFDF5",
  borderColor: "#A7F3D0",
  color: "#047857",
};

const smallAmberButtonStyle: CSSProperties = {
  ...smallButtonBase,
  background: "#FFFBEB",
  borderColor: "#FDE68A",
  color: "#B45309",
};

const smallDangerButtonStyle: CSSProperties = {
  ...smallButtonBase,
  background: "#FEF2F2",
  borderColor: "#FCA5A5",
  color: "#B91C1C",
};

const emptyStyle: CSSProperties = {
  border: "1px dashed #CBD5E1",
  borderRadius: 16,
  padding: 24,
  textAlign: "center",
  color: "#64748B",
  fontWeight: 850,
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,.55)",
  display: "grid",
  placeItems: "center",
  zIndex: 90,
  padding: 20,
};

const modalStyle: CSSProperties = {
  width: "100%",
  maxWidth: 760,
  maxHeight: "92vh",
  overflowY: "auto",
  background: "#FFFFFF",
  borderRadius: 24,
  padding: 24,
  boxShadow: "0 28px 90px rgba(15,23,42,.35)",
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "start",
  gap: 16,
  marginBottom: 18,
};

const iconButtonStyle: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 12,
  border: "1px solid #E2E8F0",
  background: "#F8FAFC",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 14,
};

const labelStyle: CSSProperties = {
  color: "#334155",
  fontSize: 13,
  fontWeight: 900,
};

const inputStyle: CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  borderRadius: 13,
  padding: "12px 13px",
  fontFamily: "inherit",
  fontSize: 14,
  color: "#0F172A",
  outline: "none",
};

const checkRowStyle: CSSProperties = {
  border: "1px solid #E2E8F0",
  background: "#F8FAFC",
  borderRadius: 13,
  padding: "12px 13px",
  display: "flex",
  alignItems: "center",
  gap: 9,
  color: "#334155",
  fontWeight: 850,
};

const modalFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 18,
  flexWrap: "wrap",
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  background: "#0F766E",
  color: "#FFFFFF",
  borderRadius: 13,
  padding: "12px 16px",
  fontFamily: "inherit",
  fontWeight: 950,
  cursor: "pointer",
};

const dangerPrimaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: "#DC2626",
};

const outlineButtonStyle: CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#334155",
  borderRadius: 13,
  padding: "12px 16px",
  fontFamily: "inherit",
  fontWeight: 950,
  cursor: "pointer",
};

const warningMiniStyle: CSSProperties = {
  background: "#FFFBEB",
  border: "1px solid #FDE68A",
  color: "#92400E",
  borderRadius: 16,
  padding: 14,
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  marginBottom: 14,
};

const assignedOkBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  marginTop: 6,
  padding: "3px 9px",
  borderRadius: 999,
  background: "#ECFDF5",
  border: "1px solid #A7F3D0",
  color: "#047857",
  fontSize: 11,
  fontWeight: 800,
};

const assignedWarnBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  marginTop: 6,
  padding: "3px 9px",
  borderRadius: 999,
  background: "#FFFBEB",
  border: "1px solid #FDE68A",
  color: "#B45309",
  fontSize: 11,
  fontWeight: 800,
};

const personnelCardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
  background: "#F0FDFA",
  border: "1px solid #99F6E4",
  borderRadius: 16,
  padding: "14px 18px",
};

const personnelSelectStyle: CSSProperties = {
  height: 38,
  minWidth: 220,
  border: "1px solid #99F6E4",
  borderRadius: 999,
  background: "#FFFFFF",
  color: "#0F172A",
  padding: "0 12px",
  fontSize: 13,
  fontWeight: 700,
  outline: "none",
  cursor: "pointer",
};

const historyCardStyle: CSSProperties = {
  border: "1px solid #E2E8F0",
  background: "#F8FAFC",
  borderRadius: 16,
  padding: 14,
};