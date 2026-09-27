# Runtime extension for common-python-tasks' managed application Dockerfile.
USER root
COPY --from=platform_frontend /web/dist /opt/stacksmith-platform/web
ENV STACKSMITH_PLATFORM_WEB_DIR=/opt/stacksmith-platform/web
USER ${RUNTIME_USER}
