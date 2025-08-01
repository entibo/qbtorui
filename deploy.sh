#!/bin/bash

set -a
source .env
set +a

# --delete  delete extraneous files from dest dirs
# --dry-run
rsync -avz --delete public/ "$REMOTE:$REMOTE_PATH"
