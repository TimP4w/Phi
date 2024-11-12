FROM alpine:latest

RUN addgroup -S phi && adduser -S phi -G phi

WORKDIR /phi

COPY  dist/web /phi/web
COPY --chown=phi:phi dist/phi .

EXPOSE 8080

USER phi

CMD ["./phi", "-frontend", "/phi/web"]
