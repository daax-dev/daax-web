# Rebuild daax-web container (Windows PowerShell)
#
# Usage:
#   .\rebuild.ps1                              # Build and run container
#   $env:DAAX_WORKSPACE="C:\prj"; .\rebuild.ps1
#   .\rebuild.ps1 -SkipPull                    # Skip pre-pulling agent images
#
param(
    [string]$Workspace,
    [string]$ClaudeConfig,
    [string]$HomeMcp,
    [switch]$SkipPull
)

# Agent images to pre-pull for AI coding features
$AgentImages = @(
    "jpoley/daax-agents-flowspec:latest"
    "jpoley/daax-agents:latest"
)

$ErrorActionPreference = "Stop"

# Change to script directory
Push-Location $PSScriptRoot

try {
    $ContainerName = "daax"
    $NetworkName = "daax-net"
    $ImageName = "daax"

    # Resolve paths with fallbacks
    $WorkspacePath = if ($Workspace) { $Workspace }
                     elseif ($env:DAAX_WORKSPACE) { $env:DAAX_WORKSPACE }
                     else { Join-Path $HOME "prj" }

    $ClaudeConfigPath = if ($ClaudeConfig) { $ClaudeConfig }
                        elseif ($env:CLAUDE_CONFIG_PATH) { $env:CLAUDE_CONFIG_PATH }
                        else { Join-Path $HOME ".claude.json" }

    $HomeMcpPath = if ($HomeMcp) { $HomeMcp }
                   elseif ($env:HOME_MCP_PATH) { $env:HOME_MCP_PATH }
                   else { "" }

    $ClaudeDir = if ($env:CLAUDE_DIR) { $env:CLAUDE_DIR }
                 else { Join-Path $HOME ".claude" }

    Write-Host "Stopping existing container..." -ForegroundColor Red
    $ErrorActionPreference = "SilentlyContinue"
    docker rm -f $ContainerName 2>&1 | Out-Null
    $ErrorActionPreference = "Stop"

    Write-Host "Freeing ports 4200/4201..." -ForegroundColor Magenta
    try {
        # Kill processes using ports 4200 and 4201
        $ports = @(4200, 4201)
        foreach ($port in $ports) {
            $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
            foreach ($conn in $connections) {
                if ($conn.OwningProcess -ne 0) {
                    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
                }
            }
        }
    } catch {
        # Ignore errors - ports may not be in use
    }

    Write-Host "Building image..." -ForegroundColor Yellow
    docker build -t $ImageName .
    if ($LASTEXITCODE -ne 0) { throw "Docker build failed" }

    # Pre-pull agent images for AI coding features
    if (-not $SkipPull) {
        Write-Host "Pre-pulling AI agent images..." -ForegroundColor Blue
        foreach ($img in $AgentImages) {
            Write-Host "   Pulling $img..."
            $ErrorActionPreference = "SilentlyContinue"
            docker pull $img 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "   ✅ Pulled $img" -ForegroundColor Green
            } else {
                Write-Host "   ⚠️  Warning: Could not pull $img (will try on-demand)" -ForegroundColor Yellow
            }
            $ErrorActionPreference = "Stop"
        }
    } else {
        Write-Host "Skipping agent image pre-pull (-SkipPull specified)" -ForegroundColor Yellow
    }

    Write-Host "Ensuring network exists..." -ForegroundColor Cyan
    $ErrorActionPreference = "SilentlyContinue"
    docker network create $NetworkName 2>&1 | Out-Null
    $ErrorActionPreference = "Stop"

    Write-Host "Starting container..." -ForegroundColor Green
    Write-Host "   Workspace: $WorkspacePath"
    Write-Host "   Claude config: $ClaudeConfigPath"

    # Validate CLAUDE_DIR exists before mounting
    if (-not (Test-Path $ClaudeDir -PathType Container)) {
        Write-Host "Warning: CLAUDE_DIR ($ClaudeDir) does not exist" -ForegroundColor Yellow
        Write-Host "   Creating directory to prevent mount errors..."
        New-Item -ItemType Directory -Path $ClaudeDir -Force | Out-Null
    }

    # Helper function to convert Windows paths to Docker-compatible format
    function Convert-ToDockerPath {
        param([string]$Path)

        if (-not $Path) { return $Path }

        # Warn about UNC paths which may not work with Docker volume mounts
        if ($Path -match '^\\\\') {
            Write-Warning "UNC paths may not be supported for Docker volume mounts: '$Path'. Consider using a local drive path instead."
        }

        # Docker Desktop on Windows can use Windows paths directly, but we need forward slashes
        return ($Path -replace '\\', '/')
    }

    # Convert Windows paths to Docker-compatible format
    $DockerWorkspace = Convert-ToDockerPath -Path $WorkspacePath
    $DockerClaudeConfig = Convert-ToDockerPath -Path $ClaudeConfigPath
    $DockerClaudeDir = Convert-ToDockerPath -Path $ClaudeDir

    # Build docker run arguments
    # Note: On Windows with Docker Desktop, mount the socket and let Docker translate
    # Docker Desktop exposes /var/run/docker.sock for Linux containers automatically

    # SECURITY NOTE: The Docker socket mount (-v /var/run/docker.sock) grants
    # the daax container full control over the Docker host. This is REQUIRED for:
    # - Spawning AI agent containers (Claude Code, OpenCode, etc.)
    # - Managing container lifecycle from the web UI
    # - Pre-pulling images on-demand when not available locally
    # This is an intentional design decision for a development workbench.
    # Do NOT expose daax to untrusted networks without additional access controls.
    $DockerArgs = @(
        "run"
        "-d"
        "--name", $ContainerName
        "--network", $NetworkName
        "--add-host=host.docker.internal:host-gateway"
        "-p", "4200:4200"
        "-p", "4201:4201"
        "-v", "/var/run/docker.sock:/var/run/docker.sock"
        "-v", "${DockerWorkspace}:/workspace"
        "-v", "${DockerClaudeConfig}:/host-config/.claude.json:rw"
        "-v", "${DockerClaudeDir}:/host-claude:ro"
        "-e", "DOCKER_NETWORK=$NetworkName"
        "-e", "HOST_WORKSPACE_PATH=$DockerWorkspace"
        "-e", "CLAUDE_CODE_CONFIG=/host-config/.claude.json"
        "-e", "CLAUDE_PROJECTS_DIR=/host-claude/projects"
        "-e", "NEXT_PUBLIC_DEPLOYMENT_MODE=container"
        "-e", "TERMINAL_HOST=0.0.0.0"
        # Terminal WS auth (F1b, #95): forward the ticket secret + strict flag.
        "-e", "DAAX_REQUIRE_AUTH=$($env:DAAX_REQUIRE_AUTH)"
        "-e", "DAAX_WS_TOKEN_SECRET=$($env:DAAX_WS_TOKEN_SECRET)"
    )

    # Only mount HOME_MCP if it exists as a file
    if ($HomeMcpPath -and (Test-Path $HomeMcpPath -PathType Leaf)) {
        Write-Host "   Home MCP: $HomeMcpPath"
        $DockerHomeMcp = Convert-ToDockerPath -Path $HomeMcpPath
        $DockerArgs += @("-v", "${DockerHomeMcp}:/host-config/.mcp.json:ro")
        $DockerArgs += @("-e", "HOME_MCP_JSON=/host-config/.mcp.json")
    } else {
        Write-Host "   Home MCP: (not found, will scan /workspace for .mcp.json files)"
    }

    $DockerArgs += $ImageName

    # Run docker with the arguments
    & docker @DockerArgs
    if ($LASTEXITCODE -ne 0) { throw "Docker run failed" }

    # Determine the access URL
    $DaaxUrl = if ($env:DAAX_URL_OVERRIDE) {
        $env:DAAX_URL_OVERRIDE
    } else {
        $HostRef = if ($env:COMPUTERNAME) { $env:COMPUTERNAME.ToLower() } else { "localhost" }
        $DaaxDomain = if ($env:DAAX_DOMAIN) { $env:DAAX_DOMAIN } else { "poley.dev" }
        $SpecialHosts = if ($env:DAAX_SPECIAL_HOSTS) { $env:DAAX_SPECIAL_HOSTS } else { "kinsale,muckross,tralee,killarney" }

        $url = "http://localhost:4200"
        $hosts = $SpecialHosts -split ','
        foreach ($h in $hosts) {
            if ($HostRef -eq $h.Trim()) {
                $url = "https://daax.$HostRef.$DaaxDomain"
                break
            }
        }
        $url
    }

    Write-Host "Daax is running at $DaaxUrl" -ForegroundColor Green
    Write-Host "View logs: docker logs -f $ContainerName" -ForegroundColor Cyan

} finally {
    Pop-Location
}
