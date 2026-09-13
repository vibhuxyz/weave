FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY repo/ /app/

RUN npm install --no-audit --no-fund \
    && git init -q \
    && git add -A \
    && git -c user.email=harbor@weave.dev -c user.name=harbor commit -q -m "before state"
