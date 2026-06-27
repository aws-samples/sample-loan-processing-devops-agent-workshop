FROM nginx:alpine

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

# Copy pre-built assets (build outside docker for speed)
COPY dist/ /usr/share/nginx/html/

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Create non-root user and adjust permissions
RUN adduser -D -u 1001 appuser \
    && chown -R appuser:appuser /var/cache/nginx /var/log/nginx /etc/nginx/conf.d \
    && touch /var/run/nginx.pid && chown appuser:appuser /var/run/nginx.pid

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
