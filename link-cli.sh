#!/bin/bash

echo "🔗 Linking all CLI tools defined in package.json..."

npm link || echo "⚠️ npm link failed"
