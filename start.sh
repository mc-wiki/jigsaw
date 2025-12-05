#!/bin/bash

export PATH="/root/.local/share/fnm:$PATH"
eval "$(fnm env --use-on-cd --shell bash)"

pnpm install
pnpm run start
