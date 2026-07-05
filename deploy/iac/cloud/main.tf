# deploy/iac/cloud/main.tf — SKELETON ONLY (F9 #104, §8). Intentionally inert:
# resource blocks are commented so nothing is half-wired or broken. Pick a
# provider, implement the matching blocks, then `terraform apply`. See README.md.
#
# The point of committing this is the CONTRACT (inputs in variables.tf, the
# database_url output below), not a runnable module. Local deploys use none of it.

terraform {
  required_version = ">= 1.5.0"
  # required_providers {
  #   # Uncomment the block for your chosen provider (var.provider_name):
  #   aws       = { source = "hashicorp/aws",       version = "~> 5.0" }
  #   google    = { source = "hashicorp/google",    version = "~> 5.0" }
  #   azurerm   = { source = "hashicorp/azurerm",   version = "~> 3.0" }
  #   hcloud    = { source = "hetznercloud/hcloud", version = "~> 1.45" }
  #   tailscale = { source = "tailscale/tailscale", version = "~> 0.16" }
  # }
}

# --- 1. VM (any provider) -----------------------------------------------------
# A single VM with Docker + Compose, joined to the tailnet, on which
# `scripts/deploy.sh cloud` runs the SAME Compose stack as local.
#
# resource "hcloud_server" "daax" {
#   name        = "daax-cloud"
#   server_type = var.vm_size
#   location    = var.region
#   image       = "docker-ce"
#   ssh_keys    = [var.ssh_public_key]
#   user_data   = templatefile("${path.module}/cloud-init.yaml.tftpl", {
#     tailscale_auth_key = var.tailscale_auth_key
#   })
# }

# --- 2. DNS (optional; else use Tailscale MagicDNS) ---------------------------
# resource "..._record" "daax" { ... }  # daax.<host> -> VM / tailnet IP

# --- 3. Managed Postgres (optional; var.managed_postgres) ---------------------
# When true, provision a managed DB and expose its connection string as the
# `database_url` output; the operator exports it as DATABASE_URL (see README).
# resource "aws_db_instance" "daax" { count = var.managed_postgres ? 1 : 0 ... }

# --- Outputs ------------------------------------------------------------------
# The database_url output is the connection-string-swap mechanism: feed it into
# DATABASE_URL (a secret) with DAAX_PG_MANAGED=1. Placeholder until a managed-DB
# resource above is implemented.
output "database_url" {
  description = "Managed Postgres connection string to export as DATABASE_URL (empty when compose-local)."
  value       = var.managed_postgres ? "postgres://REPLACE_ME" : ""
  sensitive   = true
}

output "next_steps" {
  description = "What to run after apply."
  value       = "ssh to the VM, `source ~/.secrets`, then: scripts/deploy.sh cloud"
}
