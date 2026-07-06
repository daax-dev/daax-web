# Provider-parameterized inputs for the optional cloud target (F9 #104, §8).
# Skeleton only — see README.md. Local deploys use none of this.

variable "provider_name" {
  description = "Cloud provider to target (aws | gcp | azure | hetzner)."
  type        = string
  default     = "hetzner"
}

variable "region" {
  description = "Provider region / location for the VM and (optional) managed DB."
  type        = string
}

variable "vm_size" {
  description = "Instance type / machine size for the daax VM."
  type        = string
  default     = "small"
}

variable "ssh_public_key" {
  description = "SSH public key authorized on the VM for operator access."
  type        = string
}

variable "dns_zone" {
  description = "DNS zone for daax.<host> / daax-code.<host> records (empty = use Tailscale MagicDNS only)."
  type        = string
  default     = ""
}

variable "tailscale_auth_key" {
  description = "Tailscale auth key to join the VM to the tailnet. SECRET — pass via TF_VAR_tailscale_auth_key, never commit."
  type        = string
  sensitive   = true
  default     = ""
}

variable "managed_postgres" {
  description = "Provision a managed Postgres (true) or run compose-local Postgres on the VM (false)."
  type        = bool
  default     = false
}

variable "allowed_ips" {
  description = "Optional source-IP allow-list for ingress (CIDRs). Empty = rely on Tailscale ACLs only."
  type        = list(string)
  default     = []
}
