#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

let iteration = 0;
let lastCount = -1;
let stallCount = 0;
let consecutiveFull = 0;

while (true) {
  iteration++;
  const result = spawnSync('pnpm', ['--filter', '@kitsuneos/acceptance', 'test'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = `${result.stdout}\n${result.stderr}`;
  const passMatch = output.match(/Tests\s+(\d+) passed/);
  const failMatch = output.match(/Tests\s+.*?(\d+) failed/);
  const passCount = passMatch ? Number.parseInt(passMatch[1], 10) : 0;
  const failCount = failMatch ? Number.parseInt(failMatch[1], 10) : 0;
  const total = 22;
  const mainPassing = failCount === 0 && passCount >= total;
  console.log(
    `iteration ${iteration} — ${mainPassing ? total : passCount}/${total} passing — fixed: (see failures)`,
  );

  if (mainPassing && result.status === 0) {
    consecutiveFull++;
    if (consecutiveFull >= 2) {
      console.log('Exit: all tests passed twice consecutively');
      process.exit(0);
    }
  } else {
    consecutiveFull = 0;
  }

  if (passCount <= lastCount && !mainPassing) {
    stallCount++;
    if (stallCount >= 2) {
      console.error('Abort: two consecutive iterations without progress');
      console.error(output);
      process.exit(1);
    }
  } else {
    stallCount = 0;
  }
  lastCount = passCount;

  if (mainPassing) {
    continue;
  }

  console.error(output.slice(-4000));
  process.exit(result.status ?? 1);
}
