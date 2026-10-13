#!/usr/bin/env node
/**
 * Builds the BudgetSplit agile board on GitHub from docs/board/backlog.json:
 *   labels (persona, priority, type) -> milestones -> one issue per user story ->
 *   a GitHub Project (board view) with a Points field and each story's status.
 *
 * Safe to re-run: anything that already exists is reused, not duplicated.
 *
 * Requirements: GitHub CLI (`gh`), logged in with the project scope:
 *   gh auth login
 *   gh auth refresh -s project
 *
 * Usage (from the repo root, works on Windows, macOS and Linux):
 *   node scripts/bootstrap-board.mjs --dry-run      # print the plan, change nothing
 *   node scripts/bootstrap-board.mjs                # defaults to no-ad-technologies/budgetsplit
 *   node scripts/bootstrap-board.mjs --repo OWNER/REPO
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const repoArg = args[args.indexOf("--repo") + 1];
const repo = args.includes("--repo") && repoArg ? repoArg : "no-ad-technologies/budgetsplit";
const [owner] = repo.split("/");
const PROJECT_TITLE = "BudgetSplit board";

const backlog = JSON.parse(readFileSync(new URL("../docs/board/backlog.json", import.meta.url), "utf8"));
const milestoneTitle = Object.fromEntries(backlog.milestones.map((m) => [m.key, m.title]));

const LABELS = [
  { name: "type:story", color: "1d76db", description: "User story" },
  { name: "persona:maya", color: "c5def5", description: "Maya, the Organizer Roommate" },
  { name: "persona:josh", color: "bfdadc", description: "Josh, the Forgetful Friend" },
  { name: "persona:priya", color: "d4c5f9", description: "Priya, the Budget-Conscious Planner" },
  { name: "priority:must", color: "b60205", description: "MoSCoW: must have" },
  { name: "priority:should", color: "fbca04", description: "MoSCoW: should have" },
  { name: "priority:could", color: "0e8a16", description: "MoSCoW: could have" },
];

function gh(ghArgs, { json = false } = {}) {
  const out = execFileSync("gh", ghArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return json ? JSON.parse(out) : out.trim();
}

function issueBody(s) {
  return [
    `**Persona:** ${s.persona[0].toUpperCase()}${s.persona.slice(1)}`,
    `**Priority:** ${s.priority} · **Points:** ${s.points}`,
    "",
    "## Story",
    s.story,
    "",
    "## Acceptance criteria",
    ...s.criteria.map((c) => `- [ ] ${c}`),
  ].join("\n");
}

if (dryRun) {
  console.log(`DRY RUN for ${repo} — nothing will be created.\n`);
  console.log(`Labels: ${LABELS.map((l) => l.name).join(", ")}`);
  console.log(`Milestones: ${backlog.milestones.map((m) => m.title).join(" | ")}`);
  console.log(`Project: "${PROJECT_TITLE}" (owner ${owner}) with a Points field\n`);
  for (const s of backlog.stories) {
    console.log(`${s.id} · ${s.title}  [${s.persona}, ${s.priority}, ${s.points} pts, ${milestoneTitle[s.milestone]}, ${s.status}]`);
  }
  process.exit(0);
}

gh(["auth", "status"]);

// 1. Labels (--force updates color and description if the label exists).
for (const l of LABELS) {
  gh(["label", "create", l.name, "--repo", repo, "--color", l.color, "--description", l.description, "--force"]);
}
console.log(`✓ ${LABELS.length} labels`);

// 2. Milestones.
const existingMilestones = gh(["api", `repos/${repo}/milestones?state=all&per_page=100`], { json: true });
for (const m of backlog.milestones) {
  if (!existingMilestones.some((e) => e.title === m.title)) {
    gh(["api", "-X", "POST", `repos/${repo}/milestones`, "-f", `title=${m.title}`, "-f", `description=${m.description}`]);
  }
}
console.log(`✓ ${backlog.milestones.length} milestones`);

// 3. One issue per story.
const existingIssues = gh(["issue", "list", "--repo", repo, "--state", "all", "--limit", "200", "--json", "number,title,url"], {
  json: true,
});
const issueUrl = {};
for (const s of backlog.stories) {
  const title = `${s.id} · ${s.title}`;
  const found = existingIssues.find((i) => i.title.startsWith(`${s.id} `));
  issueUrl[s.id] =
    found?.url ??
    gh([
      "issue", "create", "--repo", repo,
      "--title", title,
      "--body", issueBody(s),
      "--label", ["type:story", `persona:${s.persona}`, `priority:${s.priority}`].join(","),
      "--milestone", milestoneTitle[s.milestone],
    ]);
  console.log(`✓ ${title} -> ${issueUrl[s.id]}`);
}

// 4. The project board.
const projects = gh(["project", "list", "--owner", owner, "--format", "json"], { json: true }).projects ?? [];
let project = projects.find((p) => p.title === PROJECT_TITLE);
if (!project) project = gh(["project", "create", "--owner", owner, "--title", PROJECT_TITLE, "--format", "json"], { json: true });
const number = String(project.number);
try {
  gh(["project", "link", number, "--owner", owner, "--repo", repo]);
} catch {
  // Already linked.
}
const projectId = gh(["project", "view", number, "--owner", owner, "--format", "json"], { json: true }).id;

let fields = gh(["project", "field-list", number, "--owner", owner, "--format", "json"], { json: true }).fields;
if (!fields.some((f) => f.name === "Points")) {
  gh(["project", "field-create", number, "--owner", owner, "--name", "Points", "--data-type", "NUMBER"]);
  fields = gh(["project", "field-list", number, "--owner", owner, "--format", "json"], { json: true }).fields;
}
const pointsField = fields.find((f) => f.name === "Points");
const statusField = fields.find((f) => f.name === "Status");

for (const s of backlog.stories) {
  const item = gh(["project", "item-add", number, "--owner", owner, "--url", issueUrl[s.id], "--format", "json"], { json: true });
  gh(["project", "item-edit", "--id", item.id, "--project-id", projectId, "--field-id", pointsField.id, "--number", String(s.points)]);
  const option = statusField?.options?.find((o) => o.name.toLowerCase() === s.status.toLowerCase());
  if (option) {
    gh(["project", "item-edit", "--id", item.id, "--project-id", projectId, "--field-id", statusField.id, "--single-select-option-id", option.id]);
  }
}
console.log(`✓ Project "${PROJECT_TITLE}": ${project.url ?? `#${number}`}`);
console.log('Next: open the project, choose "Board" layout, and add an "In review" column to Status.');
