// Tiny assertion + reporting helper shared by the test files.
export const results = [];

let file = "";
let failedInFile = 0;

export function startFile(name) {
  file = name;
  failedInFile = 0;
  console.log(`\n# ${name}`);
}

export function section(title) {
  console.log(`\n  ${title}`);
}

export function check(name, pass, detail = "") {
  const ok = !!pass;
  if (!ok) failedInFile++;
  results.push({ file, name, ok, detail: detail === "" ? "" : String(detail) });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? `  — ${detail}` : ""}`);
}

export function summarize() {
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed` +
      (failed.length ? ` — ${failed.length} failed` : "")
  );
  for (const f of failed) console.log(`  ✗ [${f.file}] ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  return failed.length;
}
