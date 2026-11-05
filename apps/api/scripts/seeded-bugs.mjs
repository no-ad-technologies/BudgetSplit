// Seeded-bug experiment for D3 (AI component, part 2): docs/ai/m3-ai-generated-tests.md.
//
// Plants one bug at a time in src/modules/expenses/split.ts, runs the AI-generated test file and the
// hand-designed test file against it, then restores the original source. A bug is "caught" by a test
// file if at least one of its tests fails. Not part of CI (it edits a source file while it runs).
//
// Usage (from apps/api):  npm run test:seeded-bugs
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SOURCE = "src/modules/expenses/split.ts";
const SUITES = {
  ai: "test/split.percent.ai.test.ts",
  hand: "test/split.percent.test.ts",
};

/** Each bug replaces one exact snippet of split.ts. S1 is the primary seeded bug in the report. */
const BUGS = [
  {
    id: "S1",
    name: "Leftover cent goes to any member with a non-zero percentage, even if their exact share is already whole",
    from: "hasFraction: (amountCents * basisPoints) % FULL_PERCENT_BASIS_POINTS !== 0,",
    to: "hasFraction: basisPoints > 0,",
  },
  {
    id: "S2",
    name: "Leftover cents go to the first members in join order, like US-03 (0% members included)",
    from: "if (share.hasFraction) {",
    to: "if (true) {",
  },
  {
    id: "S3",
    name: "Leftover cents handed out from the last member instead of the first",
    from: "for (const share of shares) {",
    to: "for (const share of [...shares].reverse()) {",
  },
  {
    id: "S4",
    name: "Math.round instead of Math.floor for the base share",
    from: "shareCents: Math.floor((amountCents * basisPoints) / FULL_PERCENT_BASIS_POINTS),",
    to: "shareCents: Math.round((amountCents * basisPoints) / FULL_PERCENT_BASIS_POINTS),",
  },
  {
    id: "S5",
    name: "Total check tolerates ±1 basis point (99.99% and 100.01% accepted)",
    from: "if (totalBasisPoints !== FULL_PERCENT_BASIS_POINTS) {",
    to: "if (Math.abs(totalBasisPoints - FULL_PERCENT_BASIS_POINTS) > 1) {",
  },
  {
    id: "S6",
    name: "Off-by-one on the maximum: $10,000.00 itself rejected",
    from: "amountCents > MAX_EXPENSE_CENTS",
    to: "amountCents >= MAX_EXPENSE_CENTS",
  },
  {
    id: "S7",
    name: "Fractional basis points accepted",
    from: "!Number.isInteger(basisPoints) || ",
    to: "",
  },
  {
    id: "S8",
    name: "Negative percentages accepted",
    from: "basisPoints < 0 || ",
    to: "",
  },
  {
    id: "S9",
    name: "Duplicate members accepted",
    from: "if (new Set(memberIds).size !== memberIds.length) {",
    to: "if (false) {",
  },
];

function runSuite(file) {
  const out = join(tmpdir(), `seeded-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  spawnSync("npx", ["vitest", "run", file, "--reporter=json", `--outputFile=${out}`], { encoding: "utf8" });
  try {
    const report = JSON.parse(readFileSync(out, "utf8"));
    const failedNames = report.testResults
      .flatMap((r) => r.assertionResults)
      .filter((a) => a.status === "failed")
      .map((a) => a.title);
    return { total: report.numTotalTests, failed: report.numFailedTests, failedNames };
  } finally {
    rmSync(out, { force: true });
  }
}

const original = readFileSync(SOURCE, "utf8");
const restore = () => writeFileSync(SOURCE, original);
process.on("SIGINT", () => {
  restore();
  process.exit(130);
});

const results = [];
try {
  const baseline = { ai: runSuite(SUITES.ai), hand: runSuite(SUITES.hand) };
  if (baseline.ai.failed || baseline.hand.failed) throw new Error("Both suites must pass on the original code first.");
  console.log(`Baseline: AI ${baseline.ai.total} tests, hand ${baseline.hand.total} tests, all passing.\n`);

  for (const bug of BUGS) {
    const occurrences = original.split(bug.from).length - 1;
    if (occurrences !== 1) throw new Error(`${bug.id}: snippet found ${occurrences} times, expected exactly 1`);
    writeFileSync(SOURCE, original.replace(bug.from, bug.to));
    const ai = runSuite(SUITES.ai);
    const hand = runSuite(SUITES.hand);
    restore();
    results.push({ ...bug, ai, hand });
    console.log(`${bug.id} ${bug.name}`);
    console.log(`   AI:   ${ai.failed ? `CAUGHT (${ai.failed} failing: ${ai.failedNames.join("; ")})` : "missed"}`);
    console.log(`   hand: ${hand.failed ? `CAUGHT (${hand.failed} failing: ${hand.failedNames.join("; ")})` : "missed"}`);
  }
} finally {
  restore();
}

const caught = (suite) => results.filter((r) => r[suite].failed > 0).length;
console.log(`\nSummary: AI tests caught ${caught("ai")}/${results.length} bugs, hand-designed caught ${caught("hand")}/${results.length}.`);
console.log("\n| Bug | AI-generated | Hand-designed |\n| --- | --- | --- |");
for (const r of results) {
  const cell = (s) => (s.failed ? `caught (${s.failed}/${s.total} fail)` : "**missed**");
  console.log(`| ${r.id} ${r.name} | ${cell(r.ai)} | ${cell(r.hand)} |`);
}
