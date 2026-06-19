import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const root = new URL("../src/", import.meta.url).pathname;
const vi = JSON.parse(readFileSync(root + "lib/locales/vi.json", "utf8"));
const en = JSON.parse(readFileSync(root + "lib/locales/en.json", "utf8"));

const placeholders = (s) =>
  typeof s === "string"
    ? [...s.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1].trim())
    : [];

// A placeholder is "bad" if it's not a plain identifier (contains operators,
// spaces, dots, parens) — i18next can't evaluate it.
const isBadPlaceholder = (p) => !/^[a-zA-Z0-9_]+(,\s*\w+)?$/.test(p);

// 1) Key parity between vi and en
const viKeys = new Set(Object.keys(flatten(vi)));
const enKeys = new Set(Object.keys(flatten(en)));
const onlyVi = [...viKeys].filter((k) => !enKeys.has(k));
const onlyEn = [...enKeys].filter((k) => !viKeys.has(k));

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

// 2) Bad placeholders (un-evaluatable expressions) in values
const badVi = [];
for (const [k, v] of Object.entries(flatten(vi))) {
  for (const p of placeholders(v)) if (isBadPlaceholder(p)) badVi.push([k, p, v]);
}
const badEn = [];
for (const [k, v] of Object.entries(flatten(en))) {
  for (const p of placeholders(v)) if (isBadPlaceholder(p)) badEn.push([k, p, v]);
}

// 3) vi vs en placeholder-set mismatch (different interpolation vars)
const placeholderMismatch = [];
for (const k of viKeys) {
  if (!enKeys.has(k)) continue;
  const pv = new Set(placeholders(flatten(vi)[k]).filter((p) => !isBadPlaceholder(p)));
  const pe = new Set(placeholders(flatten(en)[k]).filter((p) => !isBadPlaceholder(p)));
  const diff = [...pv].filter((x) => !pe.has(x)).concat([...pe].filter((x) => !pv.has(x)));
  if (diff.length) placeholderMismatch.push([k, [...pv], [...pe]]);
}

// 4) Call sites: t('key', { var: ... }) — extract passed option var names and
//    compare against value placeholders.
const grep = execSync(
  `grep -rnoE "t\\('[a-zA-Z0-9_]+', \\{[^}]*\\}" ${root} | grep -v "locales/" || true`,
  { encoding: "utf8" },
);
const callMismatch = [];
for (const line of grep.split("\n").filter(Boolean)) {
  const m = line.match(/t\('([a-zA-Z0-9_]+)', \{([^}]*)\}/);
  if (!m) continue;
  const [, key, args] = m;
  const passed = [...args.matchAll(/([a-zA-Z0-9_]+)\s*:/g)].map((x) => x[1]);
  // shorthand { foo } counts foo as both name and value
  const shorthand = args
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-zA-Z0-9_]+$/.test(s));
  const passedVars = new Set([...passed, ...shorthand]);
  const need = new Set(placeholders(flatten(vi)[key] ?? "").map((p) => p.split(",")[0].trim()));
  const missing = [...need].filter((n) => !passedVars.has(n) && !isBadPlaceholder(n));
  const fileLine = line.split(":").slice(0, 2).join(":").replace(root, "");
  if (missing.length || !viKeys.has(key)) {
    callMismatch.push({ fileLine, key, passed: [...passedVars], need: [...need], missing, keyExists: viKeys.has(key) });
  }
}

console.log("== KEY PARITY ==");
console.log("only in vi:", onlyVi);
console.log("only in en:", onlyEn);
console.log("\n== BAD PLACEHOLDERS (vi) ==");
badVi.forEach(([k, p]) => console.log(`  ${k}  ->  {{${p}}}`));
console.log("\n== BAD PLACEHOLDERS (en) ==");
badEn.forEach(([k, p]) => console.log(`  ${k}  ->  {{${p}}}`));
console.log("\n== vi/en PLACEHOLDER MISMATCH ==");
placeholderMismatch.forEach(([k, pv, pe]) => console.log(`  ${k}  vi:[${pv}] en:[${pe}]`));
console.log("\n== CALL-SITE vs VALUE MISMATCH ==");
callMismatch.forEach((c) =>
  console.log(`  ${c.fileLine}  ${c.key}  passed:[${c.passed}] need:[${c.need}] missing:[${c.missing}]${c.keyExists ? "" : "  <KEY MISSING>"}`),
);
