FROM oven/bun:1
WORKDIR /app
COPY index.ts ./
COPY src/ ./src/
EXPOSE 8787
VOLUME /data
CMD ["bun", "run", "index.ts"]
