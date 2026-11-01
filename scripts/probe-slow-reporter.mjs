// PROBE (never merge): prints every test over 10 s, and every Dialog story test, with its duration.
export default class SlowReporter {
  onTestCaseResult(testCase) {
    const duration = testCase.diagnostic()?.duration ?? 0;
    if (duration > 10_000 || /Dialog\//.test(testCase.name)) console.log(`SLOW ${Math.round(duration)} ms ${testCase.project.name} ${testCase.fullName} ${testCase.result().state}`);
  }
}
