function text(value) {
  return String(value ?? "").trim();
}

function num(value) {
  return Number(value || 0) || 0;
}

function parseDate(value) {
  const raw = text(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

function normalizeStateCode(value) {
  const digits = text(value).replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(0, 2).padStart(2, "0");
}

function stateCodeFromGstin(value) {
  const gstin = text(value).toUpperCase();
  return /^\d{2}[A-Z0-9]{13}$/.test(gstin) ? gstin.slice(0, 2) : "";
}

function escapeRegExp(value) {
  return text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  escapeRegExp,
  normalizeStateCode,
  num,
  parseDate,
  stateCodeFromGstin,
  text
};
