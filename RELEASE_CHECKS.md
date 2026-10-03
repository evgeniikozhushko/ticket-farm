# Release verification

`pnpm test` remains convenient for unit development and may skip integration suites.
Release candidates must use `pnpm check:release`, which requires a reachable writable
local replica set and executes all tests, lint, types, the production dependency audit,
and a build. It fails before testing if the integration database is unavailable.
Each integration suite creates a random database and drops it afterward; never use
the app's Atlas database or its credentials for these tests.

## Disposable local database

Install MongoDB Community from the official MongoDB distribution, then run in a
separate terminal (replace the binary path with your installed `mongod`):

```sh
mkdir -p /private/tmp/ticket-farm-release-mongo/data
mongod --dbpath /private/tmp/ticket-farm-release-mongo/data --port 27187 --bind_ip 127.0.0.1 --replSet ticketfarmtest
```

Initialize once using `mongosh`:

```sh
mongosh 'mongodb://127.0.0.1:27187/?directConnection=true' --eval 'rs.initiate({_id:"ticketfarmtest",members:[{_id:0,host:"127.0.0.1:27187"}]})'
```

After election, run:

```sh
pnpm install --frozen-lockfile
TICKET_FARM_TEST_MONGODB_URI='mongodb://127.0.0.1:27187/?replicaSet=ticketfarmtest' pnpm check:release
```

Stop the test server with Ctrl-C after verification. Reusing its local data directory
does not require reinitializing the replica set. MongoDB's [testing replica-set guide](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set-for-testing/)
describes the database setup.

## Release evidence

Record the source revision, lockfile, command results, test counts and date in the
release report. Repeat after application changes. A local passing gate does not
prove provider wiring or Production configuration. Complete the live gates in
`BETA_DEPLOY_CHECKLIST.md` for the immutable candidate Preview deployment and verify
Production settings before merging: `main` automatically deploys Production.

The build uses your configured local environment; independently verify Production
environment values and the resulting Production build. Repository checks do not
establish that GitHub branch protection or Vercel deployment gates are enabled.
