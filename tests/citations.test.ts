import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { citationPostPass } from '../src/lib/citations';

const S123 = new Set(['S1', 'S2', 'S3']);

describe('citationPostPass — cited claims stay', () => {
  test('single valid citation is preserved in cleanedBrief', () => {
    const { cleanedBrief, unverifiedFlags, stats } = citationPostPass(
      'Revenue grew 40 percent last year. [S1]',
      S123,
    );
    assert.ok(cleanedBrief.includes('[S1]'), 'citation marker must survive');
    assert.strictEqual(unverifiedFlags.length, 0);
    assert.strictEqual(stats.claimsTotal, 1);
    assert.strictEqual(stats.claimsCited, 1);
    assert.strictEqual(stats.coveragePct, 100);
  });

  test('multiple valid citations on one line are both kept', () => {
    const { cleanedBrief, stats } = citationPostPass(
      'Revenue grew 40 percent and costs fell 10 percent. [S1] [S2]',
      S123,
    );
    assert.ok(cleanedBrief.includes('[S1]'));
    assert.ok(cleanedBrief.includes('[S2]'));
    assert.strictEqual(stats.claimsCited, 1);
  });
});

describe('citationPostPass — uncited claims go to unverifiedFlags', () => {
  test('uncited claim is removed from brief and added to flags', () => {
    const { cleanedBrief, unverifiedFlags, stats } = citationPostPass(
      'Revenue grew 40 percent last year.',
      S123,
    );
    assert.strictEqual(cleanedBrief.trim(), '');
    assert.strictEqual(unverifiedFlags.length, 1);
    assert.ok(unverifiedFlags[0].includes('Revenue grew'));
    assert.strictEqual(stats.claimsTotal, 1);
    assert.strictEqual(stats.claimsCited, 0);
    assert.strictEqual(stats.coveragePct, 0);
  });

  test('flagged text does not carry any citation marker', () => {
    const { unverifiedFlags } = citationPostPass(
      'Inflation hit 9 percent in 2025. [S99]',
      S123,
    );
    assert.ok(!unverifiedFlags[0].includes('[S99]'));
  });
});

describe('citationPostPass — invalid citation indices', () => {
  test('invalid-only citation, claim becomes uncited and is flagged', () => {
    const { cleanedBrief, unverifiedFlags, stats } = citationPostPass(
      'Inflation hit 9 percent in 2025. [S99]',
      S123,
    );
    assert.strictEqual(cleanedBrief.trim(), '');
    assert.strictEqual(unverifiedFlags.length, 1);
    assert.strictEqual(stats.claimsCited, 0);
  });

  test('mixed valid + invalid: invalid stripped, claim kept via valid', () => {
    const { cleanedBrief, unverifiedFlags, stats } = citationPostPass(
      'Revenue grew 40 percent last year. [S1] [S99]',
      S123,
    );
    assert.ok(cleanedBrief.includes('[S1]'), 'valid citation kept');
    assert.ok(!cleanedBrief.includes('[S99]'), 'invalid citation stripped');
    assert.strictEqual(unverifiedFlags.length, 0);
    assert.strictEqual(stats.claimsCited, 1);
  });
});

describe('citationPostPass — stats edge cases', () => {
  test('zero checkable claims → coveragePct is null, never 0 or 100', () => {
    const { stats } = citationPostPass('# What is the market outlook?', S123);
    assert.strictEqual(
      stats.coveragePct,
      null,
      'coveragePct must be null when there are no claims',
    );
    assert.strictEqual(stats.claimsTotal, 0);
  });

  test('mixed cited and uncited → correct coverage percentage', () => {
    const brief = [
      'Revenue grew 40 percent last year. [S1]',
      'Costs fell by half last quarter.',
    ].join('\n');
    const { stats } = citationPostPass(brief, S123);
    assert.strictEqual(stats.claimsTotal, 2);
    assert.strictEqual(stats.claimsCited, 1);
    assert.strictEqual(stats.coveragePct, 50);
  });
});

describe('citationPostPass — structural features', () => {
  test('standalone citation line is re-attached to preceding claim', () => {
    const brief = ['The market grew significantly in Q3.', '[S2]'].join('\n');
    const { stats, unverifiedFlags } = citationPostPass(brief, S123);
    assert.strictEqual(stats.claimsCited, 1, 'citation re-attached and counted');
    assert.strictEqual(unverifiedFlags.length, 0);
  });

  test('first-line question heading is not checked as a claim', () => {
    const { cleanedBrief, stats } = citationPostPass(
      '# What is the market size?',
      S123,
    );
    assert.ok(cleanedBrief.includes('#'), 'heading preserved');
    assert.strictEqual(stats.claimsTotal, 0);
  });

  test('recognised section labels are not counted as claims', () => {
    const { stats } = citationPostPass(
      '## Summary\n\n## Findings\n\n## Conclusion',
      S123,
    );
    assert.strictEqual(stats.claimsTotal, 0);
  });
});
