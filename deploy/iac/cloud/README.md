# deploy/iac/cloud — thin, optional IaC for the CLOUD target only (F9 #104, §8)

**Status: documented skeleton + follow-up.** This directory intentionally does
**not** ship a fully-wired, apply-ready Terraform module. The brain2daax spec
(§7) explicitly rejects porting a heavy provider resource graph, and F9's AC5
says: provide the mechanism + a skeleton, and mark the rest a follow-up rather
than half-build broken IaC. That is exactly what this is.

Local deploys need **none** of this — `scripts/deploy.sh kinsale` runs the same
Compose stack with a compose-local Postgres and no IaC at all.

## What the cloud target actually needs

The cheapest, lock-in-free cloud path (§8) is **the same Compose stack on any
cloud VM** (EC2 / GCE / Azure VM / Hetzner) behind Traefik + Tailscale. So the
IaC surface is deliberately tiny:

1. **A VM** (any provider) with Docker + Compose, on your tailnet.
2. **DNS** for `daax.<host>` / `daax-code.<host>` (or use the Tailscale MagicDNS name).
3. **Optionally, a managed Postgres** (RDS / Cloud SQL / Neon / Azure Postgres).

Everything else — image, health checks, SBOM, provenance, secrets — is handled
by `scripts/deploy.sh <target>` running **on** that VM, unchanged from local.

## The managed-Postgres mechanism (supported today, no code change)

The app already speaks Postgres, so switching from the compose-local container to
a managed instance is a **connection-string swap**:

```bash
# in deploy/env/cloud.env:  DAAX_PG_MANAGED=1
export DATABASE_URL='postgres://user:pw@my-db.abc123.us-east-1.rds.amazonaws.com:5432/daax?sslmode=require'
scripts/deploy.sh cloud
```

`deploy.sh` preflight TCP-checks the managed host and **fails closed** if it is
unreachable, then runs migrations against it. No application code changes.

> Follow-up (not in this PR): a `docker-compose.cloud.yml` override that drops the
> local `postgres`/`migrate-local` coupling so a fully-managed deploy does not
> also start an unused Postgres container. Tracked separately.

## variables.tf

`variables.tf` enumerates the provider-parameterized inputs (region, VM size,
DNS zone, whether to provision a managed DB) so a real module can be filled in
per provider. `main.tf` is a commented skeleton showing where the VM / DNS /
managed-DB resources go — deliberately inert so nothing is half-wired.

To use it: pick a provider, uncomment/implement the matching resource blocks,
`terraform init && terraform apply`, then run `scripts/deploy.sh cloud` on the
resulting VM. The `database_url` output feeds `DATABASE_URL` above.
