#!/bin/bash

# Verifier script for hello-world task
# Checks if greeting.txt exists and contains valid content

REWARD_FILE="/logs/verifier/reward.txt"
mkdir -p "$(dirname "$REWARD_FILE")"

# Check if greeting.txt exists
if [ ! -f "greeting.txt" ]; then
    echo "0" > "$REWARD_FILE"
    echo "FAIL: greeting.txt not found"
    exit 0
fi

# Read content
CONTENT=$(cat greeting.txt)

# Check if content has at least 10 words
WORD_COUNT=$(echo "$CONTENT" | wc -w | tr -d ' ')
if [ "$WORD_COUNT" -lt 10 ]; then
    echo "0" > "$REWARD_FILE"
    echo "FAIL: greeting.txt has only $WORD_COUNT words (need at least 10)"
    exit 0
fi

# Check if content contains greeting-related keywords (case-insensitive)
if echo "$CONTENT" | grep -iE "(welcome|greeting|hello|harbor)" > /dev/null; then
    echo "1" > "$REWARD_FILE"
    echo "PASS: greeting.txt contains valid greeting ($WORD_COUNT words)"
    exit 0
else
    echo "0" > "$REWARD_FILE"
    echo "FAIL: greeting.txt doesn't contain greeting-related keywords"
    exit 0
fi
