/**
 * GitHub Actions Workflow for Building DevContainer Images
 *
 * This workflow is pushed to the dev-containers repo to build
 * container images from devcontainer templates.
 */

export const DEVCONTAINER_BUILD_WORKFLOW = `name: Build DevContainer Images

on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - '.github/workflows/build-devcontainers.yml'
  pull_request:
    branches: [main]
    paths:
      - 'src/**'
  workflow_dispatch:
    inputs:
      template:
        description: 'Specific template to build (leave empty for all changed)'
        required: false
        type: string

env:
  REGISTRY: ghcr.io

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      templates: \${{ steps.changes.outputs.templates }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Detect changed templates
        id: changes
        run: |
          if [ -n "\${{ github.event.inputs.template }}" ]; then
            echo "templates=[\\\"\${{ github.event.inputs.template }}\\\"]" >> $GITHUB_OUTPUT
          else
            # Get changed directories in src/
            CHANGED=$(git diff --name-only \${{ github.event.before }} \${{ github.sha }} -- src/ | cut -d'/' -f2 | sort -u | jq -R -s -c 'split("\\n") | map(select(length > 0))')
            echo "templates=$CHANGED" >> $GITHUB_OUTPUT
          fi

  build:
    needs: detect-changes
    if: needs.detect-changes.outputs.templates != '[]'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    strategy:
      fail-fast: false
      matrix:
        template: \${{ fromJson(needs.detect-changes.outputs.templates) }}

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: \${{ env.REGISTRY }}
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: Install devcontainer CLI
        run: npm install -g @devcontainers/cli

      - name: Read template metadata
        id: meta
        run: |
          TEMPLATE_DIR="src/\${{ matrix.template }}"
          if [ -f "$TEMPLATE_DIR/devcontainer-template.json" ]; then
            VERSION=$(jq -r '.version // "latest"' "$TEMPLATE_DIR/devcontainer-template.json")
            NAME=$(jq -r '.id // "\${{ matrix.template }}"' "$TEMPLATE_DIR/devcontainer-template.json")
          else
            VERSION="latest"
            NAME="\${{ matrix.template }}"
          fi
          echo "version=$VERSION" >> $GITHUB_OUTPUT
          echo "name=$NAME" >> $GITHUB_OUTPUT

          # Generate image name
          IMAGE_NAME="\${{ env.REGISTRY }}/\${{ github.repository_owner }}/devcontainer-\${{ matrix.template }}"
          echo "image=$IMAGE_NAME" >> $GITHUB_OUTPUT

      - name: Build devcontainer image
        run: |
          devcontainer build \\
            --workspace-folder "src/\${{ matrix.template }}" \\
            --image-name "\${{ steps.meta.outputs.image }}:\${{ steps.meta.outputs.version }}" \\
            --image-name "\${{ steps.meta.outputs.image }}:latest"

      - name: Push image
        if: github.event_name != 'pull_request'
        run: |
          docker push "\${{ steps.meta.outputs.image }}:\${{ steps.meta.outputs.version }}"
          docker push "\${{ steps.meta.outputs.image }}:latest"

      - name: Generate SBOM
        if: github.event_name != 'pull_request'
        uses: anchore/sbom-action@v0
        with:
          image: "\${{ steps.meta.outputs.image }}:latest"
          artifact-name: "sbom-\${{ matrix.template }}.spdx.json"
          output-file: "sbom-\${{ matrix.template }}.spdx.json"

      - name: Upload SBOM
        if: github.event_name != 'pull_request'
        uses: actions/upload-artifact@v4
        with:
          name: sbom-\${{ matrix.template }}
          path: "sbom-*.json"

  summary:
    needs: [detect-changes, build]
    runs-on: ubuntu-latest
    if: always()
    steps:
      - name: Build Summary
        run: |
          echo "## DevContainer Build Summary" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "Templates processed: \${{ needs.detect-changes.outputs.templates }}" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          if [ "\${{ needs.build.result }}" == "success" ]; then
            echo "✅ All builds completed successfully" >> $GITHUB_STEP_SUMMARY
          else
            echo "❌ Some builds failed - check individual job logs" >> $GITHUB_STEP_SUMMARY
          fi
`;

export const DEVCONTAINER_RELEASE_WORKFLOW = `name: Release DevContainer Templates

on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      version:
        description: 'Version tag (e.g., v1.0.0)'
        required: true
        type: string

env:
  REGISTRY: ghcr.io

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Get version
        id: version
        run: |
          if [ -n "\${{ github.event.inputs.version }}" ]; then
            VERSION="\${{ github.event.inputs.version }}"
          else
            VERSION="\${{ github.ref_name }}"
          fi
          # Strip 'v' prefix if present
          VERSION=\${VERSION#v}
          echo "version=$VERSION" >> $GITHUB_OUTPUT

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: \${{ env.REGISTRY }}
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: Install devcontainer CLI
        run: npm install -g @devcontainers/cli

      - name: Build and push all templates
        run: |
          for template_dir in src/*/; do
            template=$(basename "$template_dir")
            if [ -f "$template_dir/devcontainer.json" ] || [ -f "$template_dir/.devcontainer/devcontainer.json" ]; then
              echo "Building $template..."
              IMAGE="\${{ env.REGISTRY }}/\${{ github.repository_owner }}/devcontainer-$template"

              devcontainer build \\
                --workspace-folder "$template_dir" \\
                --image-name "$IMAGE:\${{ steps.version.outputs.version }}" \\
                --image-name "$IMAGE:latest"

              docker push "$IMAGE:\${{ steps.version.outputs.version }}"
              docker push "$IMAGE:latest"

              echo "✅ $template pushed successfully"
            fi
          done
`;

/**
 * Get all workflow files that should be pushed to the dev-containers repo
 */
export function getWorkflowFiles(): { path: string; content: string }[] {
  return [
    {
      path: ".github/workflows/build-devcontainers.yml",
      content: DEVCONTAINER_BUILD_WORKFLOW,
    },
    {
      path: ".github/workflows/release.yml",
      content: DEVCONTAINER_RELEASE_WORKFLOW,
    },
  ];
}
