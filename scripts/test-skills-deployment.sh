#!/bin/bash
# test-skills-deployment.sh - Verify Claude Code skills deployment
#
# This script validates that skills are correctly deployed to .claude/skills/
# with proper structure and YAML frontmatter.
#
# Usage: ./scripts/test-skills-deployment.sh
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed

set -e

# Configuration
SKILLS_DIR=".claude/skills"
EXPECTED_SKILLS=9
EXPECTED_SKILL_NAMES=(
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

echo "=== Claude Code Skills Deployment Test ==="
echo ""

PASS=0
FAIL=0

# Test 1: Skills directory exists
echo "Test 1: Skills directory exists"
if [ -d "$SKILLS_DIR" ]; then
    echo "  [PASS] $SKILLS_DIR exists"
    ((PASS++))
else
    echo "  [FAIL] $SKILLS_DIR does not exist"
    ((FAIL++))
    echo ""
    echo "=== CRITICAL: Skills directory missing. Run deploy-skills.sh first ==="
    exit 1
fi

# Test 2: Expected number of skills
echo "Test 2: Expected number of skills"
SKILL_COUNT=$(find "$SKILLS_DIR" -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ')
if [ "$SKILL_COUNT" -eq "$EXPECTED_SKILLS" ]; then
    echo "  [PASS] Found $SKILL_COUNT skills (expected $EXPECTED_SKILLS)"
    ((PASS++))
else
    echo "  [FAIL] Found $SKILL_COUNT skills (expected $EXPECTED_SKILLS)"
    ((FAIL++))
fi

# Test 3: Each expected skill exists
echo "Test 3: Each expected skill directory exists"
MISSING=0
for skill in "${EXPECTED_SKILL_NAMES[@]}"; do
    if [ ! -d "$SKILLS_DIR/$skill" ]; then
        echo "  [FAIL] Missing skill directory: $skill"
        ((MISSING++))
    fi
done
if [ "$MISSING" -eq 0 ]; then
    echo "  [PASS] All expected skill directories exist"
    ((PASS++))
else
    echo "  [FAIL] $MISSING skill directories missing"
    ((FAIL++))
fi

# Test 4: Each skill has SKILL.md
echo "Test 4: Each skill has SKILL.md"
MISSING_FILES=0
for skill_dir in "$SKILLS_DIR"/*/; do
    skill_name=$(basename "$skill_dir")
    if [ ! -f "$skill_dir/SKILL.md" ]; then
        echo "  [FAIL] Missing SKILL.md in $skill_name"
        ((MISSING_FILES++))
    fi
done
if [ "$MISSING_FILES" -eq 0 ]; then
    echo "  [PASS] All skills have SKILL.md"
    ((PASS++))
else
    echo "  [FAIL] $MISSING_FILES skills missing SKILL.md"
    ((FAIL++))
fi

# Test 5: Valid YAML frontmatter (name field)
echo "Test 5: YAML frontmatter has 'name' field"
INVALID_NAME=0
for skill_dir in "$SKILLS_DIR"/*/; do
    skill_name=$(basename "$skill_dir")
    skill_file="$skill_dir/SKILL.md"
    if [ -f "$skill_file" ]; then
        # Extract YAML frontmatter and check for name field
        # Frontmatter is between first --- and second ---
        if ! awk '/^---$/{p++} p==1{print}' "$skill_file" | grep -q "^name:"; then
            echo "  [FAIL] Missing 'name' field in $skill_name"
            ((INVALID_NAME++))
        fi
    fi
done
if [ "$INVALID_NAME" -eq 0 ]; then
    echo "  [PASS] All skills have 'name' field in frontmatter"
    ((PASS++))
else
    echo "  [FAIL] $INVALID_NAME skills missing 'name' field"
    ((FAIL++))
fi

# Test 6: Valid YAML frontmatter (description field)
echo "Test 6: YAML frontmatter has 'description' field"
INVALID_DESC=0
for skill_dir in "$SKILLS_DIR"/*/; do
    skill_name=$(basename "$skill_dir")
    skill_file="$skill_dir/SKILL.md"
    if [ -f "$skill_file" ]; then
        # Extract YAML frontmatter and check for description field
        if ! awk '/^---$/{p++} p==1{print}' "$skill_file" | grep -q "^description:"; then
            echo "  [FAIL] Missing 'description' field in $skill_name"
            ((INVALID_DESC++))
        fi
    fi
done
if [ "$INVALID_DESC" -eq 0 ]; then
    echo "  [PASS] All skills have 'description' field in frontmatter"
    ((PASS++))
else
    echo "  [FAIL] $INVALID_DESC skills missing 'description' field"
    ((FAIL++))
fi

# Test 7: Skills are not empty (have content after frontmatter)
echo "Test 7: Skills have content after frontmatter"
EMPTY=0
for skill_dir in "$SKILLS_DIR"/*/; do
    skill_name=$(basename "$skill_dir")
    skill_file="$skill_dir/SKILL.md"
    if [ -f "$skill_file" ]; then
        # Count non-frontmatter lines
        CONTENT_LINES=$(awk '/^---$/{p++; next} p>=2{print}' "$skill_file" | grep -v '^[[:space:]]*$' | wc -l | tr -d ' ')
        if [ "$CONTENT_LINES" -lt 5 ]; then
            echo "  [FAIL] $skill_name appears to have minimal content ($CONTENT_LINES lines)"
            ((EMPTY++))
        fi
    fi
done
if [ "$EMPTY" -eq 0 ]; then
    echo "  [PASS] All skills have substantial content"
    ((PASS++))
else
    echo "  [FAIL] $EMPTY skills have minimal content"
    ((FAIL++))
fi

# Summary
echo ""
echo "=== Test Summary ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo ""

# List deployed skills
echo "=== Deployed Skills ==="
for skill_dir in "$SKILLS_DIR"/*/; do
    skill_name=$(basename "$skill_dir")
    skill_file="$skill_dir/SKILL.md"
    if [ -f "$skill_file" ]; then
        # Extract description from frontmatter (first 80 chars)
        desc=$(awk '/^---$/{p++; next} p==1 && /^description:/{sub(/^description: */, ""); print; exit}' "$skill_file")
        desc_short="${desc:0:70}"
        echo "  - $skill_name: ${desc_short}..."
    fi
done
echo ""

if [ "$FAIL" -eq 0 ]; then
    echo "ALL TESTS PASSED"
    exit 0
else
    echo "SOME TESTS FAILED"
    exit 1
fi
