Must Do

- Use a separate production Atlas project/cluster/database from local/dev.
- Enable Atlas Cloud Backup and ideally Continuous Cloud Backup/PITR. MongoDB recommends
backups, restore-window planning, and a tested restore process for operational readiness.
- Create a production-only DB user with least privilege for the app database. Do not use an
owner/admin user in MONGODB_URI.
- Rotate the MongoDB password before launch. Your .env.local has real credentials in it, and
those should not be reused for production.
- Restrict Atlas Network Access. For Vercel this can be awkward because outbound IPs may not
be static unless you use specific Vercel/networking options, but avoid broad 0.0.0.0/0 if
possible.
- Run pnpm setup-db against the production database after setting production env vars, then
verify no old indexes remain.
- Test a real public signup against the production DB before launch.
  Should Do
- Configure Atlas alerts for high connections, high CPU, disk usage, replication issues,
query targeting/scans, and backup failures.
- Set the Atlas cluster tier above free/shared if this is real production. Free/shared tiers
are fine for demos, but not for dependable production operations.
- Confirm MONGODB_URI uses the Atlas SRV connection string and has
retryWrites=true&w=majority unless you have a specific reason not to.
- Add an operational restore drill: restore the latest backup into a throwaway cluster/
database and confirm the app can read it.
- Keep MONGODB_DB_NAME distinct, e.g. ticket_farm_prod, so no script accidentally points
prod and dev at the same DB.

Below is a production-focused implementation guide for the Must Do MongoDB items for Ticket
  Farm.

1. Create Separate Production Atlas Resources
  Use a separate Atlas project or at least a separate cluster/database from local/dev.
  Recommended shape:
  Atlas Project: Ticket Farm Production
  Cluster: ticket-farm-prod
  Database: ticket_farm_prod
  App DB user: ticket_farm_app_prod
  In Atlas:
2. Go to Projects.
3. Create/select a production project.
4. Create a dedicated production cluster.
5. Choose a paid dedicated tier for real production, ideally M10+.
6. Choose the cloud region closest to your users/Vercel deployment.
  In Vercel production env vars, set:
  MONGODB_URI=mongodb+srv://ticket_farm_app_prod:@/?
  retryWrites=true&w=majority
  MONGODB_DB_NAME=ticket_farm_prod
  Do not reuse your local .env.local database for production.
7. Enable Cloud Backup and PITR
  In Atlas:
8. Open the production cluster.
9. Go to Backup.
10. Enable Cloud Backup.
11. If available for your tier, enable Continuous Cloud Backup / Point-in-Time Restore.
12. Use at least a 7-day PITR window for early production.
13. Set snapshot retention, for example:
  - Hourly snapshots retained for 24 hours
  - Daily snapshots retained for 7 days
  - Weekly snapshots retained for 4 weeks
  - Monthly snapshots retained for 3-6 months
  Then do one restore drill:
14. Restore latest backup into a temporary cluster or database.
15. Confirm collections exist: organizations, lotteries, registrants, tickets,

public_registration_rate_limits, etc.
3. Confirm indexes exist after restore.
4. Delete the temporary restore target when done.

  MongoDB’s production checklist specifically recommends backup strategy, PITR, retention
  policy, and understanding restore procedures:
  [https://www.mongodb.com/docs/atlas/architecture/current/operational-readiness-checklist/](https://www.mongodb.com/docs/atlas/architecture/current/operational-readiness-checklist/)
  Backup guidance: [https://www.mongodb.com/docs/atlas/architecture/current/backups/](https://www.mongodb.com/docs/atlas/architecture/current/backups/)

1. Create a Least-Privilege Production DB User
  In Atlas:
2. Go to Database Access.
3. Click Add New Database User.
4. Use password auth.
5. Username example:
  ticket_farm_app_prod
6. Generate a strong password.
7. Grant only app-level access.
  For Ticket Farm, the simplest reasonable role is:
  readWrite on ticket_farm_prod
  Avoid:
  Atlas admin
  readWriteAnyDatabase
  dbAdminAnyDatabase
  If you want stricter separation later, create a separate migration/setup user with temporary
  index/admin permissions, but for now readWrite is enough for the app and normal index
  creation in its own database.
  MongoDB docs on database users and scoped roles:
  [https://www.mongodb.com/docs/atlas/security-add-mongodb-users/](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/)
8. Rotate MongoDB Credentials Before Launch
  Your local .env.local currently contains real MongoDB credentials. Treat them as exposed
  once they have appeared in local files or chat/tooling.
  Implementation:
9. In Atlas Database Access, create a new production DB user.
10. Put only the new user into Vercel production env vars.
11. Redeploy production.
12. Verify app connectivity.
13. Delete or disable old DB users that are no longer needed.
14. Keep local/dev credentials separate from prod.
  Also check that .env.local is ignored by Git:
  git check-ignore .env.local
  If that returns nothing, add .env.local to .gitignore before any commit.
15. Restrict Network Access
  In Atlas:
16. Go to Network Access.
17. Remove broad access like:
  0.0.0.0/0
  if possible.
  For Vercel, static outbound IPs are not available on every setup. Your options are:

- Best: use Vercel Secure Compute / static egress / private networking if available on your
plan.
- Acceptable for private beta: temporarily allow broader access, but rely on strong DB
credentials and least-privilege user.
- Better long term: private endpoint or static egress path.
  At minimum:

1. Do not expose admin users.
2. Use a strong unique production password.
3. Restrict users to only ticket_farm_prod.
4. Enable Atlas alerts for suspicious access/connection spikes.
  MongoDB security/networking overview:
  [https://www.mongodb.com/docs/manual/security/](https://www.mongodb.com/docs/manual/security/)
5. Run Production Index Setup
  After production MONGODB_URI and MONGODB_DB_NAME are configured locally or in a secure
  shell, run the setup script against production.
  Use a temporary local env file, for example .env.production.local, but do not commit it:
  MONGODB_URI=mongodb+srv://ticket_farm_app_prod:@/?
  retryWrites=true&w=majority
  MONGODB_DB_NAME=ticket_farm_prod
  Then run:
  cp .env.production.local .env.local
  pnpm setup-db
  After it succeeds, verify the important current indexes exist:
  registrants.orgId_email_date_unique_idx
  registrants.orgId_date_enteredAt_idx
  lotteries.orgId_date_unique_idx
  tickets.ticketId_unique_idx
  tickets.orgId_winners_page_idx
  tickets.orgId_email_date_idx
  organizations.clerkOrgId_unique_idx
  organizations.slug_unique_idx
  public_registration_rate_limits.key_unique_idx
  public_registration_rate_limits.expiresAt_ttl_idx
  Also confirm old indexes are absent:
  lotteries.date_unique_idx
  registrants.email_date_idx
  registrants.email_date_unique_idx
  registrants.date_enteredAt_idx
  tickets.winners_page_idx
  tickets.email_date_idx
  Important: after using prod credentials locally, restore your dev .env.local so local
  development does not accidentally hit production.
6. Test a Real Production Signup
  After deploying with production env vars:
7. Create or confirm a production organization exists.
8. Open the public org URL:
  [https://ticketfarm.ca/](https://ticketfarm.ca/)[
9. Submit a test signup.
10. Verify in Atlas that a document was created in registrants:
  {
    orgId: "...",
    name: "...",
    email: "...",
    date: "YYYY-MM-DD",
    enteredAt: ISODate(...)
  }
11. Verify today’s lotteries row exists and has:
  {
    orgId: "...",
    date: "YYYY-MM-DD",
    status: "OPEN",
    registrantCount: 1
  }
12. Submit the same email again and confirm the app shows the duplicate-entry message, not

the generic error.
2. Submit another unique email and confirm registrantCount increments.

  Recommended Final Checklist

  [ ] Dedicated production Atlas project/cluster/database exists
  [ ] Production DB user is least-privilege, not admin
  [ ] Production MongoDB password rotated and unique
  [ ] Vercel production env vars point to production DB only
  [ ] Atlas Cloud Backup enabled
  [ ] PITR/Continuous Backup enabled if available
  [ ] Restore drill completed
  [ ] Network access restricted as much as Vercel setup allows
  [ ] pnpm setup-db run against production
  [ ] Old pre-org indexes absent
  [ ] Real production public signup tested
  [ ] Duplicate signup behavior tested

## Production Vercel MongoDB incident checklist

If Vercel Runtime Logs show any of the following against pages that
touch Mongo (typically `/`, `/onboarding`, `/dashboard/*`, `/[orgSlug]`),
work through the checks below in order. Pages that do not touch Mongo
(`/sign-up`, `/about`, `/privacy`, `/terms`) will still return 200 even
during a full DB outage, so a "some pages work, some don't" report is
the strongest tell.

Log signatures:

- `MongoServerError: bad auth : authentication failed` (Atlas code `8000`)
- `MongoServerSelectionError`
- `tlsv1 alert internal error` / `ssl3_read_bytes`
- `ReplicaSetNoPrimary`

Ordered checks:

1. **Verify the exact URI stored in Vercel.** Dashboard → Settings →
   Environment Variables → click the eye icon on `MONGODB_URI` in the
   **Production** scope. Compare hostname and username against your
   Atlas Connect string. Look specifically for the literal
   `<db_password>` placeholder — the Atlas Connect UI ships the URI
   with `<db_password>` as a placeholder that must be replaced with
   the real password.
2. **Rotate the DB password in Atlas.** Database Access → edit user →
   Autogenerate Secure Password → copy → Update User. Paste into
   Vercel `MONGODB_URI` (Production scope). Percent-encode any
   special characters (`@`, `#`, `:`, `/`, `?`, `%`).
3. **Confirm the Atlas user has `readWrite`** on the target database.
4. **Confirm Atlas Network Access.** Left sidebar of the Atlas
   PROJECT that owns the prod cluster (Network Access is per-project,
   not per-cluster). Should include `0.0.0.0/0` for Vercel serverless.
5. **Confirm cluster status.** Prod cluster (not dev) must be Active
   and not paused. Free/shared tiers auto-pause after ~7 days idle.
6. **Redeploy Vercel.** Environment variable changes do not apply to
   already-running deployments. Deployments tab → latest on `main` →
   ⋯ → Redeploy → uncheck "Use existing build cache".

Diagnostic command (from the repo root, replaces `.env.local` values
inline for a one-shot test):

```
MONGODB_URI='mongodb+srv://…' MONGODB_DB_NAME='ticket_farm_prod' pnpm check-db
```

`pnpm check-db` also accepts optional lookups: `--org-name`,
`--org-slug`, `--clerk-org-id`.