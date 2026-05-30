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

  1. Go to Projects.
  2. Create/select a production project.
  3. Create a dedicated production cluster.
  4. Choose a paid dedicated tier for real production, ideally M10+.
  5. Choose the cloud region closest to your users/Vercel deployment.

  In Vercel production env vars, set:

  MONGODB_URI=mongodb+srv://ticket_farm_app_prod:<password>@<prod-cluster-host>/?
  retryWrites=true&w=majority
  MONGODB_DB_NAME=ticket_farm_prod

  Do not reuse your local .env.local database for production.

  2. Enable Cloud Backup and PITR
  In Atlas:

  1. Open the production cluster.
  2. Go to Backup.
  3. Enable Cloud Backup.
  4. If available for your tier, enable Continuous Cloud Backup / Point-in-Time Restore.
  5. Use at least a 7-day PITR window for early production.
  6. Set snapshot retention, for example:
      - Hourly snapshots retained for 24 hours
      - Daily snapshots retained for 7 days
      - Weekly snapshots retained for 4 weeks
      - Monthly snapshots retained for 3-6 months

  Then do one restore drill:

  1. Restore latest backup into a temporary cluster or database.
  2. Confirm collections exist: organizations, lotteries, registrants, tickets,
     public_registration_rate_limits, etc.

  3. Confirm indexes exist after restore.
  4. Delete the temporary restore target when done.

  MongoDB’s production checklist specifically recommends backup strategy, PITR, retention
  policy, and understanding restore procedures:
  https://www.mongodb.com/docs/atlas/architecture/current/operational-readiness-checklist/
  Backup guidance: https://www.mongodb.com/docs/atlas/architecture/current/backups/

  3. Create a Least-Privilege Production DB User
  In Atlas:

  1. Go to Database Access.
  2. Click Add New Database User.
  3. Use password auth.
  4. Username example:

  ticket_farm_app_prod

  5. Generate a strong password.
  6. Grant only app-level access.

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
  https://www.mongodb.com/docs/atlas/security-add-mongodb-users/

  4. Rotate MongoDB Credentials Before Launch
  Your local .env.local currently contains real MongoDB credentials. Treat them as exposed
  once they have appeared in local files or chat/tooling.

  Implementation:

  1. In Atlas Database Access, create a new production DB user.
  2. Put only the new user into Vercel production env vars.
  3. Redeploy production.
  4. Verify app connectivity.
  5. Delete or disable old DB users that are no longer needed.
  6. Keep local/dev credentials separate from prod.

  Also check that .env.local is ignored by Git:

  git check-ignore .env.local

  If that returns nothing, add .env.local to .gitignore before any commit.

  5. Restrict Network Access
  In Atlas:

  1. Go to Network Access.
  2. Remove broad access like:

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
  https://www.mongodb.com/docs/manual/security/

  6. Run Production Index Setup
  After production MONGODB_URI and MONGODB_DB_NAME are configured locally or in a secure
  shell, run the setup script against production.

  Use a temporary local env file, for example .env.production.local, but do not commit it:

  MONGODB_URI=mongodb+srv://ticket_farm_app_prod:<password>@<prod-cluster-host>/?
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

  7. Test a Real Production Signup
  After deploying with production env vars:

  1. Create or confirm a production organization exists.
  2. Open the public org URL:

  https://ticketfarm.ca/<org-slug>

  3. Submit a test signup.
  4. Verify in Atlas that a document was created in registrants:

  {
    orgId: "...",
    name: "...",
    email: "...",
    date: "YYYY-MM-DD",
    enteredAt: ISODate(...)
  }

  5. Verify today’s lotteries row exists and has:

  {
    orgId: "...",
    date: "YYYY-MM-DD",
    status: "OPEN",
    registrantCount: 1
  }

  6. Submit the same email again and confirm the app shows the duplicate-entry message, not
     the generic error.

  7. Submit another unique email and confirm registrantCount increments.

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