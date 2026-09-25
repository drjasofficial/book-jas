FROM node:22-alpine

WORKDIR /app
COPY package.json server.js ./

RUN mkdir -p /data && chown -R node:node /app /data
USER node

ENV NODE_ENV=production PORT=8787 DATA_FILE=/data/events.jsonl
EXPOSE 8787
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
