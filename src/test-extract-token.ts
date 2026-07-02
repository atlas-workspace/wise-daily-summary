import { extractBearerToken } from './iam-adapter';

const testCases = [
  {
    name: 'production shape: data.accessToken',
    input: { code: 0, success: true, msg: 'OK', data: { refreshToken: 'r', accessToken: 'a', idToken: 'i', clientId: 'c', clientName: 'n', expiresAt: 123, userInfo: {} } },
    expected: 'a',
  },
  {
    name: 'top-level access_token',
    input: { access_token: 'tok1' },
    expected: 'tok1',
  },
  {
    name: 'top-level accessToken',
    input: { accessToken: 'tok2' },
    expected: 'tok2',
  },
  {
    name: 'top-level token',
    input: { token: 'tok3' },
    expected: 'tok3',
  },
  {
    name: 'nested data.access_token',
    input: { data: { access_token: 'tok4' } },
    expected: 'tok4',
  },
  {
    name: 'nested data.token',
    input: { data: { token: 'tok5' } },
    expected: 'tok5',
  },
  {
    name: 'nested data.bearerToken',
    input: { data: { bearerToken: 'tok6' } },
    expected: 'tok6',
  },
  {
    name: 'idToken as fallback',
    input: { data: { idToken: 'tok7' } },
    expected: 'tok7',
  },
  {
    name: 'data is JSON string containing accessToken',
    input: { code: 0, data: JSON.stringify({ accessToken: 'tok8' }) },
    expected: 'tok8',
  },
  {
    name: 'empty token at top level does not block nested extraction',
    input: { token: '', data: { accessToken: 'tok9' } },
    expected: 'tok9',
  },
  {
    name: 'no token anywhere returns null',
    input: { code: 0, data: { foo: 'bar' } },
    expected: null,
  },
  {
    name: 'null input returns null',
    input: null,
    expected: null,
  },
];

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const result = extractBearerToken(tc.input);
  const ok = result === tc.expected;
  if (ok) {
    passed++;
    console.log(`  PASS  ${tc.name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${tc.name} — got ${result === null ? 'null' : 'a value'}, expected ${tc.expected === null ? 'null' : 'a value'}`);
  }
}

console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed > 0) process.exit(1);
