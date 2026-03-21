#!/usr/bin/env bash
# spiffe-credential-helper.sh - SPIFFE to OIDC credential exchange helper
#
# This script enables workloads to acquire OIDC access tokens using SPIFFE identities.
# It implements the SPIFFE -> OIDC token exchange flow per RFC 8693.
#
# Usage:
#   ./spiffe-credential-helper.sh [options]
#
# Options:
#   -s, --scope SCOPE         OAuth scopes to request (default: repo:read)
#   -a, --audience URL        Target audience for the token (default: https://api.github.com)
#   -o, --output FORMAT       Output format: json|token (default: token)
#   -v, --verbose             Enable verbose output
#   -h, --help                Show this help message
#
# Environment Variables:
#   SPIFFE_ENDPOINT_SOCKET    Path to SPIRE agent socket (default: unix:///run/spire/sockets/agent.sock)
#   SPIFFE_TOKEN_EXCHANGE_URL Token exchange endpoint (default: https://auth.poley.dev/api/oidc/token)
#   SPIFFE_TRUST_DOMAIN       Trust domain (default: poley.dev)
#
# Exit Codes:
#   0 - Success
#   1 - General error
#   2 - SPIRE agent unavailable
#   3 - Token exchange failed
#   4 - Invalid configuration
#
# Example:
#   # Get access token for GitHub API
#   ./spiffe-credential-helper.sh --scope "repo:read issues:write" --audience "https://api.github.com"
#
#   # Use with curl
#   curl -H "Authorization: Bearer $(./spiffe-credential-helper.sh)" https://api.github.com/user
#
# Related:
#   - D025: Human Attribution in SPIFFE IDs
#   - RFC 8693: OAuth 2.0 Token Exchange
#   - docs/architecture/spiffe-token-exchange-flow.md

set -euo pipefail

# Constants
readonly SCRIPT_NAME=$(basename "$0")
readonly VERSION="1.0.0"

# Defaults (can be overridden by environment variables)
SPIFFE_ENDPOINT_SOCKET="${SPIFFE_ENDPOINT_SOCKET:-unix:///run/spire/sockets/agent.sock}"
SPIFFE_TOKEN_EXCHANGE_URL="${SPIFFE_TOKEN_EXCHANGE_URL:-https://auth.poley.dev/api/oidc/token}"
SPIFFE_TRUST_DOMAIN="${SPIFFE_TRUST_DOMAIN:-poley.dev}"

# Request defaults
DEFAULT_SCOPE="repo:read"
DEFAULT_AUDIENCE="https://api.github.com"
OUTPUT_FORMAT="token"
VERBOSE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

#######################################
# Print usage information
#######################################
usage() {
    cat << EOF
Usage: $SCRIPT_NAME [options]

SPIFFE to OIDC credential exchange helper

Options:
  -s, --scope SCOPE         OAuth scopes to request (default: $DEFAULT_SCOPE)
  -a, --audience URL        Target audience for the token (default: $DEFAULT_AUDIENCE)
  -o, --output FORMAT       Output format: json|token (default: token)
  -v, --verbose             Enable verbose output
  -h, --help                Show this help message
  --version                 Show version

Environment Variables:
  SPIFFE_ENDPOINT_SOCKET    SPIRE agent socket path
  SPIFFE_TOKEN_EXCHANGE_URL Token exchange endpoint URL
  SPIFFE_TRUST_DOMAIN       SPIFFE trust domain

Example:
  $SCRIPT_NAME --scope "repo:read" --audience "https://api.github.com"

EOF
}

#######################################
# Log a message to stderr if verbose mode is enabled
# Arguments:
#   $1 - Message to log
#######################################
log() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${YELLOW}[$SCRIPT_NAME]${NC} $1" >&2
    fi
}

#######################################
# Log an error message to stderr
# Arguments:
#   $1 - Error message
#######################################
error() {
    echo -e "${RED}[$SCRIPT_NAME] ERROR:${NC} $1" >&2
}

#######################################
# Log a success message to stderr if verbose
# Arguments:
#   $1 - Success message
#######################################
success() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${GREEN}[$SCRIPT_NAME]${NC} $1" >&2
    fi
}

#######################################
# Check if required tools are available
#######################################
check_dependencies() {
    local missing=()

    # Check for spire-agent CLI or go-spiffe tool
    if ! command -v spire-agent &> /dev/null; then
        # Fall back to checking for the Go SPIFFE library's fetchsvid command
        if ! command -v go-spiffe &> /dev/null; then
            log "spire-agent CLI not found, will attempt direct socket communication"
        fi
    fi

    # curl is required for token exchange
    if ! command -v curl &> /dev/null; then
        missing+=("curl")
    fi

    # jq is required for JSON parsing
    if ! command -v jq &> /dev/null; then
        missing+=("jq")
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        error "Missing required dependencies: ${missing[*]}"
        error "Install with: apt-get install ${missing[*]}"
        exit 4
    fi
}

#######################################
# Extract socket path from SPIFFE_ENDPOINT_SOCKET
# Handles both "unix:///path" and "/path" formats
# Returns:
#   The socket path without the unix:// prefix
#######################################
get_socket_path() {
    local socket_url="$SPIFFE_ENDPOINT_SOCKET"

    if [[ "$socket_url" == unix://* ]]; then
        echo "${socket_url#unix://}"
    else
        echo "$socket_url"
    fi
}

#######################################
# Check if SPIRE agent socket is accessible
# Returns:
#   0 if socket exists and is accessible
#   2 if socket is not available
#######################################
check_spire_agent() {
    local socket_path
    socket_path=$(get_socket_path)

    log "Checking SPIRE agent socket at: $socket_path"

    if [[ ! -S "$socket_path" ]]; then
        error "SPIRE agent socket not found at: $socket_path"
        error "Ensure SPIRE agent is running and the socket is mounted"
        error "For devcontainers, verify the mount in devcontainer.json:"
        error '  "mounts": ["source=/run/spire/sockets/agent.sock,target=/run/spire/sockets/agent.sock,type=bind"]'
        return 2
    fi

    success "SPIRE agent socket is accessible"
    return 0
}

#######################################
# Fetch JWT-SVID from SPIRE agent
# Uses spire-agent CLI if available, otherwise attempts direct socket communication
# Globals:
#   SPIFFE_ENDPOINT_SOCKET
# Returns:
#   JWT-SVID string on stdout
#   Non-zero exit code on failure
#######################################
fetch_jwt_svid() {
    local audience="$1"
    local socket_path
    socket_path=$(get_socket_path)

    log "Fetching JWT-SVID for audience: https://auth.${SPIFFE_TRUST_DOMAIN}"

    # Method 1: Try spire-agent CLI (preferred)
    if command -v spire-agent &> /dev/null; then
        log "Using spire-agent CLI to fetch JWT-SVID"
        local svid
        svid=$(spire-agent api fetch jwt \
            -audience "https://auth.${SPIFFE_TRUST_DOMAIN}" \
            -socketPath "$socket_path" \
            -output json 2>/dev/null | jq -r '.svids[0].svid' 2>/dev/null)

        if [[ -n "$svid" && "$svid" != "null" ]]; then
            echo "$svid"
            return 0
        fi
    fi

    # Method 2: Try go-spiffe fetchsvid tool
    if command -v go-spiffe &> /dev/null; then
        log "Using go-spiffe to fetch JWT-SVID"
        local svid
        svid=$(go-spiffe fetchjwt \
            -audience "https://auth.${SPIFFE_TRUST_DOMAIN}" \
            -socketPath "$socket_path" 2>/dev/null)

        if [[ -n "$svid" ]]; then
            echo "$svid"
            return 0
        fi
    fi

    # Method 3: Use curl to communicate with workload API (HTTP/2 over Unix socket)
    # This requires the agent to expose the Workload API endpoint
    log "Attempting direct socket communication via curl"

    local response
    response=$(curl --silent --unix-socket "$socket_path" \
        -H "Content-Type: application/json" \
        -X POST \
        "http://localhost/v1/workload/jwt-svid" \
        -d "{\"audience\": [\"https://auth.${SPIFFE_TRUST_DOMAIN}\"]}" 2>/dev/null || true)

    if [[ -n "$response" ]]; then
        local svid
        svid=$(echo "$response" | jq -r '.svids[0].svid' 2>/dev/null || true)
        if [[ -n "$svid" && "$svid" != "null" ]]; then
            echo "$svid"
            return 0
        fi
    fi

    error "Failed to fetch JWT-SVID from SPIRE agent"
    error "Tried methods: spire-agent CLI, go-spiffe, direct socket"
    error "Ensure workload is properly attested with SPIRE"
    return 2
}

#######################################
# Exchange JWT-SVID for OIDC access token via RFC 8693 token exchange
# Arguments:
#   $1 - JWT-SVID
#   $2 - Requested scopes
#   $3 - Target audience
# Returns:
#   JSON response from token exchange on stdout
#   Non-zero exit code on failure
#######################################
exchange_token() {
    local jwt_svid="$1"
    local scopes="$2"
    local audience="$3"

    log "Exchanging JWT-SVID for OIDC access token"
    log "  Token exchange URL: $SPIFFE_TOKEN_EXCHANGE_URL"
    log "  Scopes: $scopes"
    log "  Audience: $audience"

    local response
    local http_code

    # Perform RFC 8693 token exchange
    response=$(curl --silent --write-out "\n%{http_code}" \
        -X POST "$SPIFFE_TOKEN_EXCHANGE_URL" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -H "User-Agent: SPIFFE-Credential-Helper/${VERSION}" \
        -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
        -d "subject_token=${jwt_svid}" \
        -d "subject_token_type=urn:ietf:params:oauth:token-type:jwt" \
        -d "requested_token_type=urn:ietf:params:oauth:token-type:access_token" \
        -d "scope=${scopes}" \
        -d "audience=${audience}" \
        2>/dev/null)

    # Extract HTTP status code (last line)
    http_code=$(echo "$response" | tail -n 1)
    # Extract response body (all but last line)
    response=$(echo "$response" | sed '$d')

    log "Token exchange response code: $http_code"

    if [[ "$http_code" != "200" ]]; then
        local error_msg
        error_msg=$(echo "$response" | jq -r '.error_description // .error // "Unknown error"' 2>/dev/null || echo "$response")
        error "Token exchange failed (HTTP $http_code): $error_msg"

        # Provide helpful error messages for common failures
        case "$http_code" in
            400)
                error "Bad request - check JWT-SVID format and grant type parameters"
                ;;
            401)
                error "Unauthorized - SPIFFE ID may be missing human attribution (D025)"
                error "Ensure SPIFFE ID format: spiffe://poley.dev/g/<group>/u/<user>/w/<type>/<id>"
                ;;
            503)
                error "Service unavailable - SPIRE trust bundle may be stale"
                ;;
        esac

        return 3
    fi

    success "Token exchange successful"
    echo "$response"
}

#######################################
# Extract access token from token exchange response
# Arguments:
#   $1 - JSON response from token exchange
# Returns:
#   Access token string on stdout
#######################################
extract_access_token() {
    local response="$1"
    echo "$response" | jq -r '.access_token'
}

#######################################
# Main entry point
#######################################
main() {
    local scope="$DEFAULT_SCOPE"
    local audience="$DEFAULT_AUDIENCE"

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -s|--scope)
                scope="$2"
                shift 2
                ;;
            -a|--audience)
                audience="$2"
                shift 2
                ;;
            -o|--output)
                OUTPUT_FORMAT="$2"
                shift 2
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            --version)
                echo "$SCRIPT_NAME version $VERSION"
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                usage
                exit 4
                ;;
        esac
    done

    log "Starting SPIFFE credential helper v${VERSION}"
    log "Configuration:"
    log "  SPIFFE_ENDPOINT_SOCKET: $SPIFFE_ENDPOINT_SOCKET"
    log "  SPIFFE_TOKEN_EXCHANGE_URL: $SPIFFE_TOKEN_EXCHANGE_URL"
    log "  SPIFFE_TRUST_DOMAIN: $SPIFFE_TRUST_DOMAIN"

    # Validate environment
    check_dependencies
    check_spire_agent || exit 2

    # Fetch JWT-SVID from SPIRE agent
    local jwt_svid
    jwt_svid=$(fetch_jwt_svid "$audience") || exit 2

    if [[ -z "$jwt_svid" ]]; then
        error "Failed to obtain JWT-SVID"
        exit 2
    fi

    log "JWT-SVID obtained successfully"

    # Exchange JWT-SVID for OIDC access token
    local token_response
    token_response=$(exchange_token "$jwt_svid" "$scope" "$audience") || exit 3

    # Output based on requested format
    case "$OUTPUT_FORMAT" in
        json)
            echo "$token_response"
            ;;
        token)
            extract_access_token "$token_response"
            ;;
        *)
            error "Unknown output format: $OUTPUT_FORMAT"
            exit 4
            ;;
    esac

    success "Credential helper completed successfully"
}

# Run main function with all arguments
main "$@"
