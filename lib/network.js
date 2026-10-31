// Network-hospital lookup. Today: a clearly labelled DEMO dataset (data/network-hospitals.json).
// To go live, implement the same function against the insurer/TPA network API and keep the return shape.
//
// Returns { status, matches, source, message }
//   status: 'network' | 'non_network' | 'ambiguous' | 'unknown' | 'need_city'
//   'unknown' means we could not verify — never claim a hospital is in-network without data.
import dataset from '@/data/network-hospitals.json';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function nameMatches(h, name) {
  const n = norm(name).replace(/\b(hospitals?|clinic|nursing home|multispeciality|super speciality)\b/g, '').trim();
  if (!n) return false;
  const full = norm(h.name);
  return full.includes(n) || h.aliases.some((a) => n.includes(norm(a)) || norm(a).includes(n));
}

function cityMatches(h, city) {
  if (!city) return true;
  const c = norm(city);
  return norm(h.city).includes(c) || c.includes(norm(h.city)) || norm(h.area).includes(c);
}

export function lookupHospital({ name, city, networkId }) {
  const source = dataset.source; // 'demo-dataset'
  if (!name) return { status: 'unknown', matches: [], source };
  const byName = dataset.hospitals.filter((h) => nameMatches(h, name));
  if (!byName.length) {
    return { status: 'unknown', matches: [], source, message: 'Not in the demo network list — network status needs verification with the insurer/TPA.' };
  }
  const cities = [...new Set(byName.map((h) => h.city))];
  const inCity = byName.filter((h) => cityMatches(h, city));
  if (!city && cities.length > 1) return { status: 'need_city', matches: byName, source };
  if (city && !inCity.length) {
    return { status: 'unknown', matches: byName, source, message: `No ${byName[0].name} branch in ${city} in the demo list — needs verification.` };
  }
  const list = city ? inCity : byName;
  if (list.length > 1 && new Set(list.map((h) => h.area)).size > 1) return { status: 'ambiguous', matches: list, source };
  const h = list[0];
  return {
    status: h.networks.includes(networkId) ? 'network' : 'non_network',
    matches: [h],
    hospital: h,
    source,
  };
}
