#!/bin/bash
# deploy-skills.sh - Deploy Claude Code skills from FlowSpec templates
#
# This script copies skill templates from .flowspec/templates/skills/
# to .claude/skills/ where Claude Code expects them.
#
# Usage: ./scripts/deploy-skills.sh
#
# This script is idempotent - safe to run multiple times.

set -e

# Configuration
SOURCE_DIR=".flowspec/templates/skills"
TARGET_DIR=".claude/skills"
SKILLS=(
    "architect"
    "constitution-checker"
    "pm-planner"
    "qa-validator"
    "sdd-methodology"
    "security-fixer"
    "security-reporter"
    "security-reviewer"
    "security-workflow"
)

echo "=== Claude Code Skills Deployment ==="
echo ""
echo "Source: $SOURCE_DIR"
echo "Target: $TARGET_DIR"
echo ""

# Verify source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo "ERROR: Source directory not found: $SOURCE_DIR"
    echo "Make sure you are running this from the project root."
    exit 1
fi

# Create target directory
echo "Step 1: Creating target directory..."
mkdir -p "$TARGET_DIR"
echo "  [OK] Target directory ready"

# Deploy each skill
echo ""
echo "Step 2: Deploying skills..."
DEPLOYED=0
FAILED=0

for skill in "${SKILLS[@]}"; do
    skill_source="$SOURCE_DIR/$skill"
    skill_target="$TARGET_DIR/$skill"

    if [ ! -d "$skill_source" ]; then
        echo "  [ERROR] Source not found: $skill"
        ((FAILED++))
        continue
    fi

    if [ ! -f "$skill_source/SKILL.md" ]; then
        echo "  [ERROR] SKILL.md not found in: $skill"
        ((FAILED++))
        continue
    fi

    # Copy skill (overwrite if exists)
    cp -r "$skill_source" "$TARGET_DIR/"
    echo "  [OK] Deployed: $skill"
    ((DEPLOYED++))
done

echo ""
echo "=== Deployment Summary ==="
echo "Deployed: $DEPLOYED"
echo "Failed: $FAILED"
echo ""

if [ "$FAILED" -gt 0 ]; then
    echo "WARNING: Some skills failed to deploy."
    exit 1
fi

if [ "$DEPLOYED" -ne "${#SKILLS[@]}" ]; then
    echo "WARNING: Expected ${#SKILLS[@]} skills, deployed $DEPLOYED"
    exit 1
fi

echo "SUCCESS: All ${#SKILLS[@]} skills deployed."
echo ""
echo "Run 'scripts/test-skills-deployment.sh' to verify."
exit 0
