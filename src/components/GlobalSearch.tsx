// src/components/GlobalSearch.tsx
//
// Part 3e — the top-bar search was a decorative input with no handler. This
// replaces it with a REAL global search:
//   1. Pages/modules — matched against the same role-filtered nav the sidebar
//      renders (getSearchableNav), so it never suggests a forbidden page.
//   2. Users & patients — live server-side lookup via the existing
//      GET /admin/users?search=… endpoint (same one the Users page uses).
// Enter opens the first result; Esc or clicking outside closes the dropdown.

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { CornerDownLeft, Loader2, Search, UserRound } from "lucide-react";

import { getSearchableNav, type SearchableNavLeaf } from "./Sidebar";
import { getUsers, roleLabel, type User } from "../services/users";
import { useAuthStore } from "../store/authStore";
import { useLangStore } from "../store/langStore";
import { t } from "../i18n/translations";

const USER_RESULT_LIMIT = 5;

export default function GlobalSearch() {
  const navigate = useNavigate();
  const viewer = useAuthStore((s) => s.user) as any;
  const lang = useLangStore((s) => s.lang);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [userResults, setUserResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<number | null>(null);

  const navLeaves = useMemo(() => getSearchableNav(viewer, lang), [viewer, lang]);

  const pageResults = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];

    return navLeaves
      .filter((leaf) => leaf.label.toLowerCase().includes(keyword))
      .slice(0, 5);
  }, [navLeaves, query]);

  // Debounced live user/patient lookup against the real API.
  useEffect(() => {
    const keyword = query.trim();

    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    if (keyword.length < 2) {
      setUserResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const users = await getUsers({ search: keyword, per_page: USER_RESULT_LIMIT });
        setUserResults(users.slice(0, USER_RESULT_LIMIT));
      } catch {
        setUserResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close on click-outside.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function goToPage(leaf: SearchableNavLeaf) {
    setOpen(false);
    setQuery("");
    navigate(leaf.path);
  }

  function goToUser(user: User) {
    setOpen(false);
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
    setQuery("");
    // Users page reads ?q= and pre-fills its own search box (Part 3e).
    navigate(`/users?q=${encodeURIComponent(name || String(user.id))}`);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "Enter") {
      if (pageResults[0]) {
        goToPage(pageResults[0]);
      } else if (userResults[0]) {
        goToUser(userResults[0]);
      }
    }
  }

  const showDropdown = open && query.trim().length > 0;
  const nothingFound =
    showDropdown && !searching && pageResults.length === 0 && userResults.length === 0;

  return (
    <div ref={containerRef} style={{ position: "relative", flex: "1 1 240px", maxWidth: 400 }}>
      <Search
        size={16}
        style={{
          position: "absolute",
          left: 12,
          top: 19,
          transform: "translateY(-50%)",
          color: "#9CA3AF",
          pointerEvents: "none",
        }}
      />

      <input
        className="input"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={t("search_placeholder", lang)}
        aria-label="Search pages, users, and patients"
        style={{
          width: "100%",
          height: 38,
          borderRadius: 10,
          border: "1px solid #E5E7EB",
          background: "#FFFFFF",
          paddingLeft: 36,
          paddingRight: 14,
          outline: "none",
          color: "#0F172A",
          fontWeight: 700,
        }}
      />

      {showDropdown ? (
        <div style={dropdownStyle}>
          {pageResults.length > 0 ? (
            <div>
              <div style={sectionLabelStyle}>Pages</div>
              {pageResults.map((leaf) => {
                const Icon = leaf.icon;
                return (
                  <button
                    key={leaf.path}
                    type="button"
                    onClick={() => goToPage(leaf)}
                    style={resultRowStyle}
                  >
                    <Icon size={15} style={{ color: "#047857", flexShrink: 0 }} />
                    <span style={{ flex: 1, textAlign: "left" }}>{leaf.label}</span>
                    <CornerDownLeft size={13} style={{ color: "#CBD5E1" }} />
                  </button>
                );
              })}
            </div>
          ) : null}

          <div>
            <div style={sectionLabelStyle}>
              Users &amp; Patients{" "}
              {searching ? <Loader2 size={12} className="ka-gsearch-spin" /> : null}
            </div>

            {userResults.map((user) => {
              const name =
                [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
                user.email ||
                user.mobile_number ||
                `User #${user.id}`;

              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => goToUser(user)}
                  style={resultRowStyle}
                >
                  <UserRound size={15} style={{ color: "#0369A1", flexShrink: 0 }} />
                  <span style={{ flex: 1, textAlign: "left" }}>
                    {name}
                    <span style={{ color: "#94A3B8", fontWeight: 600, marginLeft: 8, fontSize: 12 }}>
                      {roleLabel(user.role)}
                    </span>
                  </span>
                </button>
              );
            })}

            {!searching && userResults.length === 0 && query.trim().length >= 2 ? (
              <div style={emptyRowStyle}>No matching users or patients.</div>
            ) : null}
            {query.trim().length < 2 ? (
              <div style={emptyRowStyle}>Type at least 2 letters to search people.</div>
            ) : null}
          </div>

          {nothingFound ? (
            <div style={emptyRowStyle}>Nothing found for “{query.trim()}”.</div>
          ) : null}

          <style>{`.ka-gsearch-spin { animation: ka-gsearch-spin 1s linear infinite; vertical-align: -2px; } @keyframes ka-gsearch-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : null}
    </div>
  );
}

const dropdownStyle: CSSProperties = {
  position: "absolute",
  top: 44,
  left: 0,
  right: 0,
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  boxShadow: "0 18px 50px rgba(15, 23, 42, 0.16)",
  padding: 8,
  zIndex: 60,
  display: "grid",
  gap: 4,
  maxHeight: 420,
  overflowY: "auto",
};

const sectionLabelStyle: CSSProperties = {
  padding: "6px 10px 4px",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#94A3B8",
};

const resultRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "9px 10px",
  borderRadius: 10,
  border: "none",
  background: "transparent",
  color: "#0F172A",
  fontWeight: 700,
  fontSize: 13.5,
  cursor: "pointer",
};

const emptyRowStyle: CSSProperties = {
  padding: "8px 10px",
  fontSize: 12.5,
  fontWeight: 600,
  color: "#94A3B8",
};
