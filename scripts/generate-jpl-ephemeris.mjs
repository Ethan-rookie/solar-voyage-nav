import { mkdir, writeFile } from "node:fs/promises";

const AU_KM = 149597870.7;
const START = "2042-01-01";
const STOP = "2048-08-28";
const OUTPUT = new URL("../assets/ephemeris/jpl/", import.meta.url);
const API = "https://ssd.jpl.nasa.gov/api/horizons.api";

const bodies = [
  ["mercury", "199", 1],
  ["venus", "299", 1],
  ["earth", "399", 1],
  ["moon", "301", 0.25],
  ["mars", "499", 1],
  ["phobos", "401", 0.25],
  ["deimos", "402", 0.25],
  ["ceres", "1;", 1],
  ["jupiter", "599", 1],
  ["io", "501", 0.25],
  ["europa", "502", 0.25],
  ["ganymede", "503", 0.25],
  ["callisto", "504", 0.25],
  ["saturn", "699", 1],
  ["enceladus", "602", 0.25],
  ["rhea", "605", 0.25],
  ["titan", "606", 0.25],
  ["iapetus", "608", 0.25],
  ["uranus", "799", 1],
  ["miranda", "705", 0.25],
  ["ariel", "701", 0.25],
  ["titania", "703", 0.25],
  ["oberon", "704", 0.25],
  ["neptune", "899", 1],
  ["triton", "801", 0.25],
];

await mkdir(OUTPUT, { recursive: true });

for (const [id, command, stepDays] of bodies) {
  const params = new URLSearchParams({
    format: "json",
    COMMAND: `'${command}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: "'500@10'",
    START_TIME: `'${START}'`,
    STOP_TIME: `'${STOP}'`,
    STEP_SIZE: stepDays === 1 ? "'1 d'" : "'6 h'",
    TIME_TYPE: "'TDB'",
    REF_PLANE: "'ECLIPTIC'",
    OUT_UNITS: "'KM-S'",
    VEC_TABLE: "'2'",
    VEC_LABELS: "'NO'",
    CSV_FORMAT: "'YES'",
  });
  const response = await fetch(`${API}?${params}`);
  if (!response.ok) throw new Error(`${id}: ${response.status}`);
  const payload = await response.json();
  const states = parseStates(payload.result);
  const sourceMatch = payload.result.match(/Target body name:.*\{source:\s*([^}]+)\}/);
  const compact = {
    id,
    jplId: command,
    source: `NASA/JPL Horizons · ${sourceMatch?.[1]?.trim() || "DE441"}`,
    signature: payload.signature,
    start: START,
    stop: STOP,
    stepDays,
    states,
  };
  await writeFile(new URL(`${id}.json`, OUTPUT), JSON.stringify(compact));
  console.log(`${id}: ${states.length} states`);
}

await writeFile(
  new URL("manifest.json", OUTPUT),
  JSON.stringify({ source: "NASA/JPL Horizons", center: "Sun (10)", frame: "Ecliptic J2000", units: "au, km/s", start: START, stop: STOP, bodies }),
);

function parseStates(result) {
  const block = result.split("$$SOE")[1]?.split("$$EOE")[0];
  if (!block) throw new Error("Horizons response has no ephemeris block");
  return block
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const columns = line.split(",").map((value) => value.trim());
      const values = columns.slice(2, 8).map(Number);
      if (values.some((value) => !Number.isFinite(value))) throw new Error(`Invalid state: ${line}`);
      return [
        round(values[0] / AU_KM, 9),
        round(values[1] / AU_KM, 9),
        round(values[2] / AU_KM, 9),
        round(values[3], 6),
        round(values[4], 6),
        round(values[5], 6),
      ];
    });
}

function round(value, digits) {
  return Number(value.toFixed(digits));
}
