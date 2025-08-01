#!/bin/bash

# Generate typescript types from
# sample JSON endpoint responses
npx quicktype --src $1 --src-lang json \
  --lang typescript \
  --just-types --prefer-unions --prefer-types --prefer-const-values