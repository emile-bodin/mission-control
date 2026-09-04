FROM node:22-alpine

ARG CODEX_VERSION

RUN addgroup -S -g 10001 codex \
    && adduser -S -D -u 10001 -G codex codex \
    && npm install --global "@openai/codex@${CODEX_VERSION}"

WORKDIR /app

COPY status-server.mjs /app/status-server.mjs
COPY gateway-server.mjs /app/gateway-server.mjs
COPY entrypoint.sh /usr/local/bin/codex-entrypoint
COPY runtime-config.toml /opt/codex/runtime-config.toml

RUN mkdir -p /home/codex/.codex \
    && chown -R codex:codex /home/codex /app /opt/codex \
    && chmod 700 /home/codex/.codex \
    && chmod 755 /usr/local/bin/codex-entrypoint

USER codex

ENTRYPOINT ["/usr/local/bin/codex-entrypoint"]
CMD ["node", "/app/status-server.mjs"]
