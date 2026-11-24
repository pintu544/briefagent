import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  signRunToken,
  parseRunToken,
  requireStage,
  TokenError,
} from '../src/lib/token';
import type { RunTokenPayload } from '../src/lib/token';

const TEST_SECRET = 'test-secret-for-unit-tests-only';

describe('token module', () => {
  const originalSecret = process.env.RUN_TOKEN_SECRET;

  before(() => {
    process.env.RUN_TOKEN_SECRET = TEST_SECRET;
  });

  after(() => {
    process.env.RUN_TOKEN_SECRET = originalSecret;
  });

  const basePayload: RunTokenPayload = {
    stage: 'planned',
    question: 'What is the global EV market size?',
    subQuestions: ['What are current sales figures?', 'What is the CAGR?'],
  };

  describe('sign / verify round-trip', () => {
    test('round-trip preserves all fields of a planned payload', () => {
      const token = signRunToken(basePayload);
      const result = parseRunToken(token);
      assert.strictEqual(result.stage, basePayload.stage);
      assert.strictEqual(result.question, basePayload.question);
      assert.deepStrictEqual(result.subQuestions, basePayload.subQuestions);
    });

    test('researched payload with sources round-trips correctly', () => {
      const payload: RunTokenPayload = {
        stage: 'researched',
        question: 'What drives EV adoption?',
        subQuestions: ['Q1'],
        sources: [
          {
            id: 'S1',
            url: 'https://example.com/report',
            title: 'EV Report 2025',
            excerpt: 'Short excerpt',
            text: 'Full article text',
            subQuestionIndex: 0,
          },
        ],
      };
      const result = parseRunToken(signRunToken(payload));
      assert.strictEqual(result.stage, 'researched');
      assert.ok(Array.isArray(result.sources));
      assert.strictEqual(result.sources![0].id, 'S1');
    });

    test('approved stage round-trips', () => {
      const payload: RunTokenPayload = {
        stage: 'approved',
        question: 'Is renewable energy cost-competitive?',
        subQuestions: ['Q1', 'Q2'],
      };
      const result = parseRunToken(signRunToken(payload));
      assert.strictEqual(result.stage, 'approved');
    });
  });

  describe('tampered payload → 401', () => {
    test('flipped byte in body base64 is rejected', () => {
      const token = signRunToken(basePayload);
      const [body, sig] = token.split('.');
      const flipped = body.slice(0, -1) + (body.slice(-1) === 'a' ? 'b' : 'a');
      assert.throws(
        () => parseRunToken(`${flipped}.${sig}`),
        (err: Error) => {
          assert.ok(err instanceof TokenError, `expected TokenError, got ${err}`);
          assert.strictEqual(err.status, 401);
          return true;
        },
      );
    });

    test('truncated signature is rejected', () => {
      const token = signRunToken(basePayload);
      const [body, sig] = token.split('.');
      assert.throws(
        () => parseRunToken(`${body}.${sig.slice(0, -4)}`),
        (err: Error) => {
          assert.ok(err instanceof TokenError);
          assert.strictEqual(err.status, 401);
          return true;
        },
      );
    });
  });

  describe('wrong secret → 401', () => {
    test('token signed with a different secret is rejected', () => {
      process.env.RUN_TOKEN_SECRET = 'evil-wrong-secret';
      const foreignToken = signRunToken(basePayload);
      process.env.RUN_TOKEN_SECRET = TEST_SECRET;

      assert.throws(
        () => parseRunToken(foreignToken),
        (err: Error) => {
          assert.ok(err instanceof TokenError);
          assert.strictEqual(err.status, 401);
          return true;
        },
      );
    });
  });

  describe('malformed input fails cleanly (no unhandled crash)', () => {
    test('empty string → TokenError 400', () => {
      assert.throws(
        () => parseRunToken(''),
        (err: Error) => {
          assert.ok(err instanceof TokenError);
          assert.strictEqual(err.status, 400);
          return true;
        },
      );
    });

    test('null → TokenError 400', () => {
      assert.throws(
        () => parseRunToken(null),
        (err: Error) => {
          assert.ok(err instanceof TokenError);
          assert.strictEqual(err.status, 400);
          return true;
        },
      );
    });

    test('undefined → TokenError 400', () => {
      assert.throws(
        () => parseRunToken(undefined),
        (err: Error) => {
          assert.ok(err instanceof TokenError);
          assert.strictEqual(err.status, 400);
          return true;
        },
      );
    });

    test('no dot separator → TokenError 401', () => {
      assert.throws(
        () => parseRunToken('notavalidtoken'),
        (err: Error) => {
          assert.ok(err instanceof TokenError);
          assert.strictEqual(err.status, 401);
          return true;
        },
      );
    });

    test('valid signature but non-JSON body → TokenError 401', () => {
      const badBody = Buffer.from('not-json!!', 'utf8').toString('base64url');
      const sig = createHmac('sha256', TEST_SECRET)
        .update(badBody)
        .digest()
        .toString('base64url');
      assert.throws(
        () => parseRunToken(`${badBody}.${sig}`),
        (err: Error) => {
          assert.ok(err instanceof TokenError);
          assert.strictEqual(err.status, 401);
          return true;
        },
      );
    });

    test('valid signature and JSON but missing required fields → TokenError 401', () => {
      const incomplete = { stage: 'planned' }; // missing question and subQuestions
      const badBody = Buffer.from(JSON.stringify(incomplete), 'utf8').toString('base64url');
      const sig = createHmac('sha256', TEST_SECRET)
        .update(badBody)
        .digest()
        .toString('base64url');
      assert.throws(
        () => parseRunToken(`${badBody}.${sig}`),
        (err: Error) => {
          assert.ok(err instanceof TokenError);
          assert.strictEqual(err.status, 401);
          return true;
        },
      );
    });

    test('researched stage with missing sources → TokenError 401', () => {
      const incomplete = {
        stage: 'researched',
        question: 'Q?',
        subQuestions: [],
        // sources is required for researched but absent here
      };
      const badBody = Buffer.from(JSON.stringify(incomplete), 'utf8').toString('base64url');
      const sig = createHmac('sha256', TEST_SECRET)
        .update(badBody)
        .digest()
        .toString('base64url');
      assert.throws(
        () => parseRunToken(`${badBody}.${sig}`),
        (err: Error) => {
          assert.ok(err instanceof TokenError);
          assert.strictEqual(err.status, 401);
          return true;
        },
      );
    });
  });

  describe('requireStage', () => {
    test('passes silently when stage matches', () => {
      const payload = parseRunToken(signRunToken(basePayload));
      assert.doesNotThrow(() => requireStage(payload, 'planned', 'wrong stage'));
    });

    test('throws TokenError 409 when stage does not match', () => {
      const payload = parseRunToken(signRunToken(basePayload));
      assert.throws(
        () => requireStage(payload, 'approved', 'Must be in approved stage'),
        (err: Error) => {
          assert.ok(err instanceof TokenError);
          assert.strictEqual(err.status, 409);
          return true;
        },
      );
    });
  });
});
