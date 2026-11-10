// src/lib/userForm.ts
//
// Small checks for the Add / Edit User form (Users.tsx), kept here so tests
// can cover them.

/**
 * Email on the user form is optional: blank is fine, anything else must look
 * like an email address. The browser used to fill this field with the admin's
 * own sign-in number (e.g. 09683214615), which the server then refused with a
 * bare "Validation failed.".
 */
export function isValidOptionalEmail(value: string | null | undefined): boolean {
  const text = String(value ?? "").trim();
  if (text === "") return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}
