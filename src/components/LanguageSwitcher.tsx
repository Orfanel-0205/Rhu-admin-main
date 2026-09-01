import { Globe2 } from "lucide-react";
import { type Lang, useLangStore } from "../store/langStore";

const options: { value: Lang; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "tag", label: "TAG" },
  { value: "pag", label: "PAG" },
];

export default function LanguageSwitcher() {
  const { lang, setLang } = useLangStore();

  return (
    <div className="ka-lang-switcher" title="Change language">
      <Globe2 size={16} />
      <select
        value={lang}
        onChange={(event) => setLang(event.target.value as Lang)}
        aria-label="Language"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}