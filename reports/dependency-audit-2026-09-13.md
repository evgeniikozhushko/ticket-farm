# Dependency audit — 2026-09-13

Command: `pnpm audit --prod --json`. Registry metadata reports 87 vulnerabilities: 6 critical, 50 high, 30 moderate, 1 low, across 620 production dependencies. The response contains 85 advisory entries; some cover multiple installed versions. These counts are dependency findings, not a count of confirmed exploitable application vulnerabilities.

Reachability needs review. For example, Windows-specific findings do not describe the documented Vercel deployment, and the react-email CLI is included as a production dependency even though it is used for local email previews.

| Package | Installed version(s) | Severity | Advisory | Patched range for this entry |
| --- | --- | --- | --- | --- |
| @isaacs/brace-expansion | 5.0.0 | high | [@isaacs/brace-expansion has Uncontrolled Resource Consumption](https://github.com/advisories/GHSA-7h2j-956f-4vf2) | >=5.0.1 |
| minimatch | 10.1.1 | high | [minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern](https://github.com/advisories/GHSA-3ppc-4f35-3m26) | >=10.2.1 |
| minimatch | 10.1.1 | high | [minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GLOBSTAR segments](https://github.com/advisories/GHSA-7r86-cg39-jmmj) | >=10.2.3 |
| minimatch | 10.1.1 | high | [minimatch ReDoS: nested *() extglobs generate catastrophically backtracking regular expressions](https://github.com/advisories/GHSA-23c5-xmqv-rm74) | >=10.2.3 |
| ajv | 8.17.1 | moderate | [ajv has ReDoS when using `$data` option](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6) | >=8.18.0 |
| socket.io-parser | 4.2.4 | high | [socket.io allows an unbounded number of binary attachments](https://github.com/advisories/GHSA-677m-j7p3-52f9) | >=4.2.6 |
| yaml | 2.8.2 | moderate | [yaml is vulnerable to Stack Overflow via deeply nested YAML collections](https://github.com/advisories/GHSA-48c2-rrv3-qjmp) | >=2.8.3 |
| lodash | 4.17.21 | high | [lodash vulnerable to Code Injection via `_.template` imports key names](https://github.com/advisories/GHSA-r5fr-rjxr-66jc) | >=4.18.0 |
| lodash | 4.17.21 | moderate | [lodash vulnerable to Prototype Pollution via array path bypass in `_.unset` and `_.omit`](https://github.com/advisories/GHSA-f23m-r3pf-42rh) | >=4.18.0 |
| postcss | 8.4.31 | moderate | [PostCSS has XSS via Unescaped </style> in its CSS Stringify Output](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) | >=8.5.10 |
| @clerk/shared | 3.44.0 | critical | [Official Clerk JavaScript SDKs: Middleware-based route protection bypass](https://github.com/advisories/GHSA-vqx2-fgx2-5wq9) | >=3.47.4 |
| @clerk/nextjs | 6.37.3 | critical | [Official Clerk JavaScript SDKs: Middleware-based route protection bypass](https://github.com/advisories/GHSA-vqx2-fgx2-5wq9) | >=6.39.2 |
| protobufjs | 7.5.4 | critical | [Arbitrary code execution in protobufjs](https://github.com/advisories/GHSA-xq3m-2v4x-88gg) | >=7.5.5 |
| protobufjs | 8.0.0 | critical | [Arbitrary code execution in protobufjs](https://github.com/advisories/GHSA-xq3m-2v4x-88gg) | >=8.0.1 |
| protobufjs | 8.0.0 | high | [protobuf.js: Code injection through bytes field defaults in generated toObject code](https://github.com/advisories/GHSA-66ff-xgx4-vchm) | >=8.0.2 |
| protobufjs | 7.5.4 | high | [protobuf.js: Code injection through bytes field defaults in generated toObject code](https://github.com/advisories/GHSA-66ff-xgx4-vchm) | >=7.5.6 |
| protobufjs | 8.0.0 | moderate | [protobuf.js: Denial of service from crafted field names in generated code](https://github.com/advisories/GHSA-2pr8-phx7-x9h3) | >=8.0.2 |
| protobufjs | 7.5.4 | moderate | [protobuf.js: Denial of service from crafted field names in generated code](https://github.com/advisories/GHSA-2pr8-phx7-x9h3) | >=7.5.6 |
| protobufjs | 8.0.0 | moderate | [protobuf.js: Prototype injection in generated message constructors](https://github.com/advisories/GHSA-fx83-v9x8-x52w) | >=8.0.2 |
| protobufjs | 7.5.4 | moderate | [protobuf.js: Prototype injection in generated message constructors](https://github.com/advisories/GHSA-fx83-v9x8-x52w) | >=7.5.6 |
| protobufjs | 8.0.0 | high | [protobuf.js: Code generation gadget after prototype pollution](https://github.com/advisories/GHSA-75px-5xx7-5xc7) | >=8.0.2 |
| protobufjs | 7.5.4 | high | [protobuf.js: Code generation gadget after prototype pollution](https://github.com/advisories/GHSA-75px-5xx7-5xc7) | >=7.5.6 |
| protobufjs | 8.0.0 | high | [protobuf.js: Process-wide denial of service through unsafe option paths](https://github.com/advisories/GHSA-jvwf-75h9-cwgg) | >=8.0.2 |
| protobufjs | 7.5.4 | high | [protobuf.js: Process-wide denial of service through unsafe option paths](https://github.com/advisories/GHSA-jvwf-75h9-cwgg) | >=7.5.6 |
| protobufjs | 8.0.0 | high | [protobuf.js: Denial of service through unbounded protobuf recursion](https://github.com/advisories/GHSA-685m-2w69-288q) | >=8.0.2 |
| protobufjs | 7.5.4 | high | [protobuf.js: Denial of service through unbounded protobuf recursion](https://github.com/advisories/GHSA-685m-2w69-288q) | >=7.5.6 |
| @protobufjs/utf8 | 1.1.0 | moderate | [protobufjs has overlong UTF-8 decoding](https://github.com/advisories/GHSA-q6x5-8v7m-xcrf) | >=1.1.1 |
| protobufjs | 8.0.0 | moderate | [protobufjs has overlong UTF-8 decoding](https://github.com/advisories/GHSA-q6x5-8v7m-xcrf) | >=8.0.2 |
| protobufjs | 7.5.4 | moderate | [protobufjs has overlong UTF-8 decoding](https://github.com/advisories/GHSA-q6x5-8v7m-xcrf) | >=7.5.6 |
| ws | 8.17.1 | moderate | [ws: Uninitialized memory disclosure](https://github.com/advisories/GHSA-58qx-3vcg-4xpx) | >=8.20.1 |
| protobufjs | 8.0.0 | moderate | [protobufjs: Denial of Service via unbounded recursive JSON descriptor expansion](https://github.com/advisories/GHSA-jggg-4jg4-v7c6) | >=8.2.0 |
| protobufjs | 7.5.4 | moderate | [protobufjs: Denial of Service via unbounded recursive JSON descriptor expansion](https://github.com/advisories/GHSA-jggg-4jg4-v7c6) | >=7.5.8 |
| uuid | 9.0.1, 10.0.0 | moderate | [uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | >=11.1.1 |
| @opentelemetry/auto-instrumentations-node | 0.69.0 | high | [Prometheus exporter process crash via malformed HTTP request](https://github.com/advisories/GHSA-q7rr-3cgh-j5r3) | >=0.75.0 |
| @opentelemetry/sdk-node | 0.211.0 | high | [Prometheus exporter process crash via malformed HTTP request](https://github.com/advisories/GHSA-q7rr-3cgh-j5r3) | >=0.217.0 |
| @opentelemetry/exporter-prometheus | 0.211.0 | high | [Prometheus exporter process crash via malformed HTTP request](https://github.com/advisories/GHSA-q7rr-3cgh-j5r3) | >=0.217.0 |
| @clerk/clerk-react | 5.60.0 | high | [Clerk has an authorization bypass when combining organization, billing, or reverification checks](https://github.com/advisories/GHSA-w24r-5266-9c3c) | >=5.61.6 |
| @clerk/nextjs | 6.37.3 | high | [Clerk has an authorization bypass when combining organization, billing, or reverification checks](https://github.com/advisories/GHSA-w24r-5266-9c3c) | >=6.39.3 |
| @clerk/backend | 2.30.1 | high | [Clerk has an authorization bypass when combining organization, billing, or reverification checks](https://github.com/advisories/GHSA-w24r-5266-9c3c) | >=2.33.3 |
| @clerk/shared | 3.44.0 | high | [Clerk has an authorization bypass when combining organization, billing, or reverification checks](https://github.com/advisories/GHSA-w24r-5266-9c3c) | >=3.47.5 |
| lodash | 4.17.21 | moderate | [Lodash has Prototype Pollution Vulnerability in `_.unset` and `_.omit` functions](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg) | >=4.17.23 |
| @grpc/grpc-js | 1.14.3 | high | [@grpc/grpc-js: A malformed request can cause a server crash](https://github.com/advisories/GHSA-5375-pq7m-f5r2) | >=1.14.4 |
| @grpc/grpc-js | 1.14.3 | high | [@grpc/grpc-js: An incoming malformed compressed message can cause a client or server crash](https://github.com/advisories/GHSA-99f4-grh7-6pcq) | >=1.14.4 |
| js-cookie | 3.0.5 | high | [JavaScript Cookie: Per-instance prototype hijack in assign() enables cookie-attribute injection](https://github.com/advisories/GHSA-qjx8-664m-686j) | >=3.0.7 |
| ws | 8.17.1 | high | [ws: Memory exhaustion DoS from tiny fragments and data chunks](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) | >=8.21.0 |
| protobufjs | 8.0.0 | high | [protobufjs: Denial of service through unbounded Any expansion during JSON conversion](https://github.com/advisories/GHSA-wcpc-wj8m-hjx6) | >=8.4.1 |
| protobufjs | 7.5.4 | high | [protobufjs: Denial of service through unbounded Any expansion during JSON conversion](https://github.com/advisories/GHSA-wcpc-wj8m-hjx6) | >=7.6.1 |
| protobufjs | 8.0.0 | moderate | [protobufjs : Schema-derived names can shadow runtime-significant properties](https://github.com/advisories/GHSA-f38q-mgvj-vph7) | >=8.6.0 |
| protobufjs | 7.5.4 | moderate | [protobufjs : Schema-derived names can shadow runtime-significant properties](https://github.com/advisories/GHSA-f38q-mgvj-vph7) | >=7.6.3 |
| @babel/core | 7.28.5 | low | [@babel/core: Arbitrary File Read via sourceMappingURL Comment](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) | >=7.29.6 |
| engine.io | 6.6.4 | high | [Socket.IO: Engine.IO Polling Transport Connection Exhaustion](https://github.com/advisories/GHSA-r635-g3xr-vw7x) | >=6.6.7 |
| protobufjs | 8.0.0 | moderate | [protobufjs: Denial of Service via infinite loop in .proto option parsing](https://github.com/advisories/GHSA-j3f2-48v5-ccww) | >=8.6.6 |
| protobufjs | 7.5.4 | moderate | [protobufjs: Denial of Service via infinite loop in .proto option parsing](https://github.com/advisories/GHSA-j3f2-48v5-ccww) | >=7.6.5 |
| @opentelemetry/propagator-jaeger | 2.5.0 | high | [OpenTelemetry JavaScript: Denial of service in `JaegerPropagator` via unhandled exception on a malformed header](https://github.com/advisories/GHSA-45rx-2jwx-cxfr) | >=2.9.0 |
| fast-uri | 3.1.0 | high | [fast-uri vulnerable to host confusion via literal backslash authority delimiter](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx) | >=3.1.4 |
| sharp | 0.34.5 | high | [sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) | >=0.35.0 |
| next | 16.2.6 | high | [Next.js: Middleware / Proxy bypass in App Router applications using Turbopack and single locale](https://github.com/advisories/GHSA-6gpp-xcg3-4w24) | >=16.2.11 |
| next | 16.2.6 | high | [Next.js: Denial of Service in App Router using Server Actions](https://github.com/advisories/GHSA-m99w-x7hq-7vfj) | >=16.2.11 |
| next | 16.2.6 | high | [Next.js: Server-Side Request Forgery in Server Actions on custom servers](https://github.com/advisories/GHSA-89xv-2m56-2m9x) | >=16.2.11 |
| next | 16.2.6 | moderate | [Next.js: Cache confusion of response bodies for requests with bodies](https://github.com/advisories/GHSA-68g3-v927-f742) | >=16.2.11 |
| next | 16.2.6 | moderate | [Next.js: Cache confusion of response bodies for requests with bodies containing invalid UTF-8 byte sequences](https://github.com/advisories/GHSA-4633-3j49-mh5q) | >=16.2.11 |
| next | 16.2.6 | moderate | [Next.js: Unbounded Server Action payload in Edge runtime](https://github.com/advisories/GHSA-4c39-4ccg-62r3) | >=16.2.11 |
| next | 16.2.6 | high | [Next.js: Server-Side Request Forgery in rewrites via attacker-controlled destination hostname](https://github.com/advisories/GHSA-p9j2-gv94-2wf4) | >=16.2.11 |
| next | 16.2.6 | moderate | [Next.js: Denial of Service in the Image Optimization API using SVGs](https://github.com/advisories/GHSA-q8wf-6r8g-63ch) | >=16.2.11 |
| next | 16.2.6 | moderate | [Next.js: Unauthenticated disclosure of internal Server Function endpoints](https://github.com/advisories/GHSA-955p-x3mx-jcvp) | >=16.2.11 |
| postcss | 8.4.31 | high | [PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments](https://github.com/advisories/GHSA-6g55-p6wh-862q) | >=8.5.12 |
| postcss | 8.4.31 | moderate | [PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) | >=8.5.23 |
| socket.io-parser | 4.2.4 | high | [Socket.IO: Zero-attachment Memory Exhaustion](https://github.com/advisories/GHSA-2m8v-j782-fhvr) | >=4.2.7 |
| fast-uri | 3.1.0 | high | [fast-uri vulnerable to host confusion via backslash authority introducer](https://github.com/advisories/GHSA-7p8r-x3mc-p8w7) | >=3.1.5 |
| nanoid | 3.3.12 | high | [nanoid: non-secure generators can loop indefinitely with negative size](https://github.com/advisories/GHSA-28wg-ghj8-5hjv) | >=3.3.16 |
| nanoid | 3.3.12 | high | [nanoid: custom generators can loop indefinitely when size is zero](https://github.com/advisories/GHSA-2v37-7h3g-55p8) | >=3.3.18 |
| postcss | 8.4.31 | high | [PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure](https://github.com/advisories/GHSA-r28c-9q8g-f849) | >=8.5.18 |
| fast-uri | 3.1.0 | high | [fast-uri vulnerable to path traversal via percent-encoded dot segments](https://github.com/advisories/GHSA-q3j6-qgpj-74h6) | >=3.1.1 |
| engine.io | 6.6.4 | high | [Socket.IO: Engine.IO WebTransport SID DoS](https://github.com/advisories/GHSA-gr94-w7qr-f4j3) | >=6.6.7 |
| fast-uri | 3.1.0 | high | [fast-uri vulnerable to host confusion via percent-encoded authority delimiters](https://github.com/advisories/GHSA-v39h-62p7-jpjc) | >=3.1.2 |
| browserslist | 4.28.0 | high | [Browserslist: Unbounded memory growth (no cache eviction) via distinct query results, leading to eventual OOM](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) | >=4.28.7 |
| browserslist | 4.28.0 | high | [Browserslist: Uncaught crash / prototype write via untrusted browserslist-stats.json custom stats (normalizeStats)](https://github.com/advisories/GHSA-73wf-gq98-2v4g) | >=4.28.7 |
| @opentelemetry/core | 2.5.0 | moderate | [OpenTelemetry Core: Unbounded memory allocation in W3C Baggage propagation](https://github.com/advisories/GHSA-8988-4f7v-96qf) | >=2.8.0 |
| fast-uri | 3.1.0 | high | [fast-uri vulnerable to server-side request forgery via malformed IPv6 normalization](https://github.com/advisories/GHSA-f65p-4m7j-42xc) | >=3.1.6 |
| fast-uri | 3.1.0 | high | [fast-uri vulnerable to host confusion via percent-encoded scheme normalization](https://github.com/advisories/GHSA-jqff-g426-hqxp) | >=3.1.6 |
| next | 16.2.6 | critical | [Next.js: Unauthenticated Remote Code Execution on windows-hosted servers](https://github.com/advisories/GHSA-p293-qw3h-jr36) | >=16.3.3 |
| baseline-browser-mapping | 2.10.32, 2.8.28 | moderate | [baseline-browser-mapping process termination on invalid input causes denial of service](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) | >=2.11.0 |
| sharp | 0.34.5 | high | [sharp: Vulnerabilities in libheif: GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) | >=0.35.4 |
| next | 16.2.6 | critical | [Next.js: Unauthenticated Remote Code Execution in Image Optimization API when AVIF files are used](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) | >=16.3.3 |
| fast-uri | 3.1.0 | high | [fast-uri vulnerable to host confusion via failed IDN canonicalization](https://github.com/advisories/GHSA-4c8g-83qw-93j6) | >=3.1.3 |

Update parent dependencies, regenerate the lockfile, and rerun the audit. A patched range on one row may not resolve later advisories affecting the same package. See the main production-readiness report for prioritization.

