import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AU_KM, createAstrodynamicsEngine, solveLambert } from "../src/astrodynamics.js";

const reference = solveLambert([5000, 10000, 2100], [-14600, 2500, 7000], 3600, 398600);
assert.ok(reference, "Lambert reference case should converge");
assertVector(reference.departureVelocityKmS, [-5.9925, 1.9254, 3.2456], 1e-3);
assertVector(reference.arrivalVelocityKmS, [-3.3125, -4.1966, -0.3853], 1e-3);

globalThis.fetch = async (url) => {
  const fileUrl = new URL(String(url), new URL("../src/", import.meta.url));
  try {
    return new Response(await readFile(fileUrl), { status: 200 });
  } catch {
    return new Response("", { status: 404 });
  }
};

const engine = createAstrodynamicsEngine("../assets/ephemeris/jpl");
await engine.loadBodies(["earth", "mars"]);
const solution = engine.solveRoute("earth", "mars", 260, 260);
assert.ok(solution && Number.isFinite(solution.totalDeltaV), "JPL Earth-Mars route should converge");
const trajectory = engine.sampleTransfer(solution, 144);
const endpointErrorAu =
  Math.sqrt(
    trajectory
      .at(-1)
      .map((value, index) => value - solution.arrivalPositionKm[index])
      .reduce((sum, value) => sum + value * value, 0),
  ) / AU_KM;
assert.ok(endpointErrorAu < 1e-5, `Integrated trajectory endpoint error is ${endpointErrorAu} au`);

console.log(`Lambert reference passed; JPL route Δv ${solution.totalDeltaV.toFixed(3)} km/s; endpoint error ${endpointErrorAu.toExponential(2)} au`);

function assertVector(actual, expected, tolerance) {
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < tolerance));
}
