// Parsing de période comptable : "YYYY-MM" (mois), "YYYY-QN" (trimestre), "YYYY" (année).
// Renvoie { label, start, end, prevLabel, prevStart, prevEnd } pour comparatif N vs N-1.

function pad2(n) {
  return String(n).padStart(2, '0');
}

function lastDayOf(year, month) {
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
}

export function defaultPeriod() {
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${prev.getUTCFullYear()}-${pad2(prev.getUTCMonth() + 1)}`;
}

export function parsePeriod(input) {
  const raw = (input || defaultPeriod()).trim();

  const q = raw.match(/^(\d{4})-Q([1-4])$/i);
  if (q) {
    const y = +q[1];
    const n = +q[2];
    const startM = (n - 1) * 3 + 1;
    const endM = startM + 2;
    const prevN = n === 1 ? 4 : n - 1;
    const prevY = n === 1 ? y - 1 : y;
    const prevStartM = (prevN - 1) * 3 + 1;
    const prevEndM = prevStartM + 2;
    return {
      label: `T${n} ${y}`,
      start: `${y}-${pad2(startM)}-01`,
      end: lastDayOf(y, endM),
      prevLabel: `T${prevN} ${prevY}`,
      prevStart: `${prevY}-${pad2(prevStartM)}-01`,
      prevEnd: lastDayOf(prevY, prevEndM),
    };
  }

  const y = raw.match(/^(\d{4})$/);
  if (y) {
    const yy = +y[1];
    return {
      label: `Année ${yy}`,
      start: `${yy}-01-01`,
      end: `${yy}-12-31`,
      prevLabel: `Année ${yy - 1}`,
      prevStart: `${yy - 1}-01-01`,
      prevEnd: `${yy - 1}-12-31`,
    };
  }

  const m = raw.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const yy = +m[1];
    const mm = +m[2];
    if (mm < 1 || mm > 12) {
      throw new Error(`Mois invalide dans "${raw}".`);
    }
    const prevMM = mm === 1 ? 12 : mm - 1;
    const prevYY = mm === 1 ? yy - 1 : yy;
    return {
      label: `${yy}-${pad2(mm)}`,
      start: `${yy}-${pad2(mm)}-01`,
      end: lastDayOf(yy, mm),
      prevLabel: `${prevYY}-${pad2(prevMM)}`,
      prevStart: `${prevYY}-${pad2(prevMM)}-01`,
      prevEnd: lastDayOf(prevYY, prevMM),
    };
  }

  throw new Error(
    `Format de période invalide : "${raw}". Utiliser "YYYY-MM" (mois), "YYYY-QN" (trimestre) ou "YYYY" (année).`
  );
}
