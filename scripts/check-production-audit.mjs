import { spawnSync } from 'node:child_process';

// This gate records a reviewed exception; it does not claim the advisories are fixed.
// Any new package, advisory, severity, or expansion of the current rollup must fail CI.
const expectedPackages = new Set([
  '@expo/cli',
  '@expo/metro',
  '@expo/metro-config',
  '@react-navigation/bottom-tabs',
  '@react-navigation/core',
  '@react-navigation/elements',
  '@react-navigation/native',
  '@react-navigation/native-stack',
  'decode-uri-component',
  'expo',
  'expo-router',
  'image-size',
  'metro',
  'metro-config',
  'metro-transform-worker',
  'query-string',
]);
const expectedAdvisories = new Map([
  [1138808, 'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr'],
  [1138809, 'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq'],
  [1147955, 'https://github.com/advisories/GHSA-vcc3-ghjq-m6fr'],
]);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmExecPath = String(process.env.npm_execpath || '').trim();
const auditCommand = npmExecPath ? process.execPath : npmCommand;
const auditArguments = npmExecPath
  ? [npmExecPath, 'audit', '--omit=dev', '--json']
  : ['audit', '--omit=dev', '--json'];
const audit = spawnSync(auditCommand, auditArguments, {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});

function fail(messages) {
  for (const message of messages) {
    console.error(`production audit gate: ${message}`);
  }
  process.exit(1);
}

if (audit.error) {
  fail([`could not run npm audit: ${audit.error.message}`]);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch (error) {
  const stderr = audit.stderr.trim();
  fail([
    `npm audit did not return valid JSON: ${error.message}`,
    ...(stderr ? [stderr] : []),
  ]);
}

if (report.error) {
  fail([`npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`]);
}

const counts = report.metadata?.vulnerabilities ?? {};
const vulnerabilities = report.vulnerabilities ?? {};
const packageNames = Object.keys(vulnerabilities).sort();
const advisories = new Map();
const failures = [];

for (const vulnerability of Object.values(vulnerabilities)) {
  for (const via of vulnerability.via ?? []) {
    if (typeof via === 'object' && Number.isInteger(via.source)) {
      advisories.set(via.source, via.url);
    }
  }
}

for (const severity of ['critical', 'low', 'info']) {
  if ((counts[severity] ?? 0) !== 0) {
    failures.push(`unexpected ${severity} findings: ${counts[severity]}`);
  }
}

if ((counts.high ?? 0) > 8) {
  failures.push(`high findings increased above the reviewed ceiling: ${counts.high}`);
}

if ((counts.moderate ?? 0) > 8) {
  failures.push(`moderate findings increased above the reviewed ceiling: ${counts.moderate}`);
}

if ((counts.total ?? 0) !== (counts.high ?? 0) + (counts.moderate ?? 0)) {
  failures.push(
    `total findings (${counts.total ?? 0}) do not equal the reviewed high-plus-moderate total (${(counts.high ?? 0) + (counts.moderate ?? 0)})`,
  );
}

const unexpectedPackages = packageNames.filter((name) => !expectedPackages.has(name));
if (unexpectedPackages.length > 0) {
  failures.push(`unreviewed vulnerable packages: ${unexpectedPackages.join(', ')}`);
}

const unexpectedAdvisories = [...advisories]
  .filter(([source, url]) => expectedAdvisories.get(source) !== url)
  .map(([source]) => source)
  .sort((a, b) => a - b);
if (unexpectedAdvisories.length > 0) {
  failures.push(`unreviewed advisory sources: ${unexpectedAdvisories.join(', ')}`);
}

if ((counts.high ?? 0) > 0 && advisories.size === 0) {
  failures.push('could not trace the remaining high findings to a reviewed advisory source');
}

if ((counts.total ?? 0) === 0 && audit.status !== 0) {
  failures.push(`npm audit exited with status ${audit.status} despite reporting no findings`);
} else if ((counts.total ?? 0) > 0 && audit.status !== 1) {
  failures.push(`npm audit exited with status ${audit.status} despite reporting findings`);
} else if (![0, 1].includes(audit.status)) {
  failures.push(`npm audit exited unexpectedly with status ${audit.status}`);
}

if (failures.length > 0) {
  fail(failures);
}

if ((counts.total ?? 0) === 0) {
  console.log('Production dependency audit is clean.');
} else {
  console.log(
    `Production audit baseline matched: ${counts.high} high and ${counts.moderate} moderate findings across ${packageNames.length} reviewed packages.`,
  );
  console.log(`Reviewed advisories: ${[...advisories.values()].sort().join(', ')}`);
}
