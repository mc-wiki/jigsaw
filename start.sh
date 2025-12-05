#!/bin/bash

eval "$(fnm env --use-on-cd --shell bash)"

pnpm install
pnpm run start
