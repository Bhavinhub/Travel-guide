#!/usr/bin/env bash
# Netlify build: if the 4K photos/audio were not uploaded with the source (slim deploys),
# pull them from the public GitHub repository, then build the site.
set -euo pipefail
REPO="${MEDIA_REPO:-Bhavinhub/Travel-guide}"
REF="${MEDIA_REF:-main}"
count=$(find public/media -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$count" -lt 100 ]; then
  echo "Fetching media from github.com/$REPO@$REF …"
  mkdir -p public
  curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$REF" \
    | tar -xz --strip-components=1 -C . "${REPO#*/}-$REF/public/media" "${REPO#*/}-$REF/public/audio"
  echo "Media files: $(find public/media -type f | wc -l | tr -d ' ')"
fi
npm run build
