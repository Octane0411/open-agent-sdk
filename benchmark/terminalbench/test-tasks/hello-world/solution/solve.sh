#!/bin/bash
set -e

# Generate greeting using oas CLI
oas chat "Generate a friendly greeting message (at least 10 words) welcoming someone to Harbor framework testing. Output only the greeting text, no markdown formatting." > greeting.txt

echo "Greeting generated and saved to greeting.txt"
